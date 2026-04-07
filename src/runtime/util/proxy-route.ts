// Pure functions for proxy route parsing — no framework dependencies.

// Extract backend name from proxy path: /api/proxy/{backend}/...
// Returns null if the path doesn't match the expected pattern.
const PROXY_PREFIX_RE = /^\/api\/proxy\/([^/]+)/
export function parseProxyRoute (path: string): { backendName: string, strippedPath: string } | null {
  const match = path.match(PROXY_PREFIX_RE)
  if (!match) {
    return null
  }
  const backendName = match[1]!
  const strippedPath = path.replace(PROXY_PREFIX_RE, '') || '/'
  return { backendName, strippedPath }
}

// Resolve the backend name to a proxyBase URL, or null if unknown.
export function resolveProxyBase (
  backendName: string,
  proxyBases: Record<string, string>
): string | null {
  return proxyBases[backendName] || null
}

// Build the target URL from proxyBase and the stripped request path.
export function buildProxyTarget (proxyBase: string, requestPath: string): string {
  const proxyBaseUrl = new URL(proxyBase)
  const proxyBasePathname = proxyBaseUrl.pathname === '/' ? '' : proxyBaseUrl.pathname
  const newPath = proxyBasePathname + requestPath
  return new URL(newPath, proxyBaseUrl.toString()).toString()
}

// Build auth headers for the proxied request.
export function buildProxyHeaders (
  graphqlApikey: string,
  accessToken?: string,
  requestApikey?: string
): Record<string, string> {
  const headers: Record<string, string> = {}
  const apikey = requestApikey || graphqlApikey
  if (apikey) {
    headers.apikey = apikey
  }
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`
  }
  return headers
}
