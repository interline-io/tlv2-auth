const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production'
const tlLog = typeof process !== 'undefined' ? process.env?.TL_LOG : undefined

// TL_LOG=trace enables trace logging in dev mode only.
export const traceEnabled = isDev && tlLog === 'trace'

export function trace (label: string, ...args: any[]) {
  console.log(`[tlv2-auth:trace] ${label}`, ...args)
}

// Log safe structural info from a user claims object (no PII).
export function traceUserClaims (label: string, user: Record<string, any> | null | undefined) {
  if (!user) {
    trace(label, null)
    return
  }
  trace(label, { sub: user.sub, iss: user.iss, aud: user.aud, claimKeys: Object.keys(user) })
}

export function traceAccessToken (token: string) {
  const parts = token.split('.')
  trace('accessToken part count:', parts.length, '(3=JWS, 5=JWE)')
  trace('accessToken length:', token.length)
  if (parts.length >= 2) {
    try {
      const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString())
      trace('accessToken header (decoded):', header)
    } catch (e: any) {
      trace('accessToken header decode FAILED:', e.message)
    }
    try {
      const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString())
      trace('accessToken payload:', { iss: payload.iss, aud: payload.aud, sub: payload.sub, exp: payload.exp, claimKeys: Object.keys(payload) })
    } catch (e: any) {
      trace('accessToken payload decode FAILED (likely encrypted/JWE):', e.message)
    }
  }
}
