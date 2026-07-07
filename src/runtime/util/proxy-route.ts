// Pure functions for building proxied requests — no framework dependencies.
// Request-path → backend resolution now lives in ../server/proxy-registry.

// Build the target URL from proxyBase and the stripped request path.
// Throws if the resolved path escapes the proxyBase origin (SSRF) or pathname
// (path traversal).
export function buildProxyTarget (proxyBase: string, requestPath: string): string {
  const proxyBaseUrl = new URL(proxyBase)
  const proxyBasePathname = proxyBaseUrl.pathname === '/' ? '' : proxyBaseUrl.pathname
  const newPath = proxyBasePathname + requestPath
  const resolved = new URL(newPath, proxyBaseUrl.toString())
  if (resolved.origin !== proxyBaseUrl.origin) {
    throw new Error(`[tlv2-proxy] SSRF detected: ${requestPath}`)
  }
  if (proxyBasePathname && !resolved.pathname.startsWith(proxyBasePathname)) {
    throw new Error(`[tlv2-proxy] Path traversal detected: ${requestPath}`)
  }
  return resolved.toString()
}

// Build auth headers for the proxied request. A valid user token is exclusive by
// default: the request is authenticated as that user and no apikey is attached,
// so the backend can never resolve it to the shared apikey identity. A backend
// that needs the apikey alongside the token (attribution/quota) opts in via
// apikeyWithToken. Only a token-less request otherwise gets an apikey — a
// request-provided one (?apikey= / apikey header) taking precedence over the
// backend's configured key. When neither a token nor a key is present, no auth
// header is sent and the backend fails closed.
export function buildProxyHeaders (
  backendApikey?: string,
  accessToken?: string,
  requestApikey?: string,
  apikeyWithToken?: boolean
): Record<string, string> {
  const headers: Record<string, string> = {}
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`
    if (!apikeyWithToken) {
      return headers
    }
  }
  const apikey = requestApikey || backendApikey
  if (apikey) {
    headers.apikey = apikey
  }
  return headers
}
