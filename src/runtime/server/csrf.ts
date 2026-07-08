// Signed double-submit CSRF tokens. HMAC via the Web Crypto API (available on
// Node, Cloudflare Workers, and browsers) so the signature can't be forged
// without the secret — that's what turns double-submit into anti-abuse: a valid
// token proves the client loaded a page and was issued one.
const CSRF_CONTEXT = 'tlv2-csrf:v1:'
const enc = new TextEncoder()

async function hmac (secret: string, msg: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(msg))
  return Buffer.from(sig).toString('base64url')
}

// Constant-time string compare; length leak is acceptable (tokens are fixed size).
function safeEqual (a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

// The HMAC secret. Reuses the auth0 session secret (domain-separated by
// CSRF_CONTEXT) so no extra config is needed; it's always seeded by the module.
export function csrfSecret (config: { auth0?: { sessionSecret?: string } }): string {
  return config?.auth0?.sessionSecret || ''
}

export async function issueCsrfToken (secret: string): Promise<string> {
  const nonce = Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(18))).toString('base64url')
  return `${nonce}.${await hmac(secret, CSRF_CONTEXT + nonce)}`
}

export async function verifyCsrfToken (token: string | undefined | null, secret: string): Promise<boolean> {
  if (!token) return false
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return false
  const nonce = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  return safeEqual(sig, await hmac(secret, CSRF_CONTEXT + nonce))
}

// Double-submit check: cookie and header must be equal and validly signed.
export async function csrfDoubleSubmitOk (
  cookieToken: string | undefined,
  headerToken: string | undefined,
  secret: string
): Promise<boolean> {
  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) return false
  return verifyCsrfToken(cookieToken, secret)
}
