// CSRF constants and pure helpers safe to import from client bundles (no crypto).
// The signing/verification lives in ../server/csrf (server-only).
export const CSRF_COOKIE = 'tlv2_csrf'
export const CSRF_HEADER = 'x-csrf-token'
export const CSRF_STATE_KEY = 'tlv2Csrf'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

// Safe (idempotent) methods skip the double-submit header: browser-navigation
// downloads and <a> links can't set headers, and SameSite=Lax already keeps
// their cookie off cross-site requests.
export function isSafeMethod (method: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase())
}

// Return `cookie` with the tlv2_csrf entry set to `token`. Used by the SSR
// loopback, whose incoming request may predate token issuance on a first visit.
export function withCsrfCookie (cookie: string, token: string): string {
  if (!token) return cookie
  const parts = (cookie ? cookie.split(/; */) : []).filter(c => c && !c.startsWith(`${CSRF_COOKIE}=`))
  parts.push(`${CSRF_COOKIE}=${token}`)
  return parts.join('; ')
}
