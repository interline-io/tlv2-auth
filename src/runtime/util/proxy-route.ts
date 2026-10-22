// Pure functions for proxy request routing/building — no framework dependencies.

// Parse `/{prefix}/{name}/rest?query` → { name, strippedPath: '/rest?query' }.
// A bare `/{prefix}/{name}` gives an empty strippedPath, so the request goes to
// the backend's base itself. Returns null when the path isn't under the prefix
// with a backend segment.
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
  return { name, strippedPath: tail + query }
}

// Remove the `apikey` query param from a path+query string. Its value is
// captured and re-applied as a header (see buildProxyHeaders), so it must never
// also ride the forwarded URL.
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
  // Its path and query below the backend's base, such as '/query'. Empty for the
  // base itself, or '/' on a base at the host root, where a URL's path can't be
  // empty.
  path: string
}

// The base joined to the stripped request path, resolved once, dot segments
// included. A trailing slash on the base is ignored, and so is any query on it.
//
// Undefined when the result escapes the base's origin (SSRF) or its path
// (traversal), including into a sibling that shares the base's prefix: /api/v2x
// is outside /api/v2.
export function buildProxyTarget (proxyBase: string, requestPath: string): ProxyTarget | undefined {
  const proxyBaseUrl = new URL(proxyBase)
  const baseRoot = proxyBaseUrl.pathname.replace(/\/+$/, '')
  // Always path-absolute: on a host-root base, an empty path or a query alone
  // would otherwise resolve against the base itself and keep the base's query.
  const reference = baseRoot + requestPath
  const resolved = new URL(reference.startsWith('/') ? reference : `/${reference}`, proxyBaseUrl)
  if (resolved.origin !== proxyBaseUrl.origin) {
    return undefined
  }
  if (baseRoot && resolved.pathname !== baseRoot && !resolved.pathname.startsWith(`${baseRoot}/`)) {
    return undefined
  }
  return { target: resolved.toString(), path: resolved.pathname.slice(baseRoot.length) + resolved.search }
}

// The headers that carry credentials, lowercase. Only the proxy sets them
// upstream; a caller's copies are stripped.
export const CREDENTIAL_HEADERS: readonly string[] = ['authorization', 'apikey', 'cookie', 'proxy-authorization']

// The caller's own credential as headers: the user's token, or without one, an
// apikey the caller supplied (?apikey= or an apikey header).
export function buildProxyHeaders (accessToken?: string, requestApikey?: string): Record<string, string> {
  if (accessToken) {
    return { authorization: `Bearer ${accessToken}` }
  }
  if (requestApikey) {
    return { apikey: requestApikey }
  }
  return {}
}
