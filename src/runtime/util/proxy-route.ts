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

// Build auth headers for the proxied request. A request-provided apikey
// (?apikey= / apikey header) takes precedence over the backend's configured
// key; when neither is present no apikey header is sent, so a backend without a
// key fails closed rather than borrowing a shared identity.
export function buildProxyHeaders (
  backendApikey?: string,
  accessToken?: string,
  requestApikey?: string
): Record<string, string> {
  const headers: Record<string, string> = {}
  const apikey = requestApikey || backendApikey
  if (apikey) {
    headers.apikey = apikey
  }
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`
  }
  return headers
}
