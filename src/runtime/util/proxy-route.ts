// Pure functions for proxy request routing/building — no framework dependencies.

// Parse `/{prefix}/{name}/rest?query` → { name, strippedPath: '/rest?query' }.
// Returns null when the path isn't under the prefix with a backend segment.
export function parseProxyRoute (path: string, prefix: string): { name: string, strippedPath: string } | null {
  if (!path.startsWith(`${prefix}/`)) {
    return null
  }
  const rest = path.slice(prefix.length + 1)
  const qIndex = rest.search(/[?#]/)
  const pathPart = qIndex === -1 ? rest : rest.slice(0, qIndex)
  const query = qIndex === -1 ? '' : rest.slice(qIndex)
  const slash = pathPart.indexOf('/')
  const name = slash === -1 ? pathPart : pathPart.slice(0, slash)
  if (!name) {
    return null
  }
  const tail = slash === -1 ? '' : pathPart.slice(slash)
  return { name, strippedPath: (tail || '/') + query }
}

// Remove the `apikey` query param from a path+query string. Its value is
// captured and re-applied as a header when policy allows (see buildProxyHeaders),
// so it must never also ride the forwarded URL.
export function stripApikeyParam (pathAndQuery: string): string {
  const q = pathAndQuery.indexOf('?')
  if (q === -1) {
    return pathAndQuery
  }
  const params = new URLSearchParams(pathAndQuery.slice(q + 1))
  if (!params.has('apikey')) {
    return pathAndQuery
  }
  params.delete('apikey')
  const rest = params.toString()
  return rest ? `${pathAndQuery.slice(0, q)}?${rest}` : pathAndQuery.slice(0, q)
}

// Where a request goes upstream.
export interface ProxyTarget {
  // The upstream URL.
  target: string
  // Its path and query below the backend's base, such as '/query'.
  path: string
}

// The base joined to the stripped request path, resolved once, dot segments
// included. A trailing slash on the base is ignored.
//
// Undefined when the result escapes the base's origin (SSRF) or its path
// (traversal), including into a sibling that shares the base's prefix: /api/v2x
// is outside /api/v2.
export function buildProxyTarget (proxyBase: string, requestPath: string): ProxyTarget | undefined {
  const proxyBaseUrl = new URL(proxyBase)
  const baseRoot = proxyBaseUrl.pathname.replace(/\/+$/, '')
  const resolved = new URL(baseRoot + requestPath, proxyBaseUrl)
  if (resolved.origin !== proxyBaseUrl.origin) {
    return undefined
  }
  if (baseRoot && resolved.pathname !== baseRoot && !resolved.pathname.startsWith(`${baseRoot}/`)) {
    return undefined
  }
  return { target: resolved.toString(), path: resolved.pathname.slice(baseRoot.length) + resolved.search }
}

// The headers that carry credentials, lowercase. Only the proxy's policy sets
// them upstream; a caller's copies are stripped.
export const CREDENTIAL_HEADERS: readonly string[] = ['authorization', 'apikey', 'cookie', 'proxy-authorization']

// Build auth headers. A valid token is exclusive (Bearer only) unless
// apikeyWithToken; otherwise a token-less request gets an apikey — a
// request-supplied one (?apikey= / header) over the backend's — or none.
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
