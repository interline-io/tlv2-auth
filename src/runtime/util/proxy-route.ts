// Pure functions for proxy route parsing — no framework dependencies.

const prefixReCache = new Map<string, RegExp>()
function getPrefixRe (prefix: string): RegExp {
  let re = prefixReCache.get(prefix)
  if (!re) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    re = new RegExp(`^${escaped}/([^/]+)`)
    prefixReCache.set(prefix, re)
  }
  return re
}

// Extract backend name from proxy path: /{prefix}/{backend}/...
// The prefix defaults to '/proxy' but is configurable via module options.
// Returns null if the path doesn't match the expected pattern.
export function parseProxyRoute (path: string, prefix: string = '/proxy'): { backendName: string, strippedPath: string } | null {
  const re = getPrefixRe(prefix)
  const match = path.match(re)
  if (!match) {
    return null
  }
  const backendName = match[1]!
  const strippedPath = path.replace(re, '') || '/'
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
// Throws if the resolved path escapes the proxyBase pathname (path traversal).
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
