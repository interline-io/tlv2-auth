// Server-only registry of proxy backends. The module's auto-register plugin
// populates it from tlv2proxy.backends; a consumer can also defineProxyBackend()
// directly. Holds API keys — never import from client code. Backed by globalThis
// so the plugin and dispatcher share one instance across the server bundle.

export interface ProxyBackend {
  /** Request path this backend serves, e.g. '/proxy/stationEditor'; matched by prefix. */
  path: string
  /** Upstream base URL requests are forwarded to. */
  proxyBase: string
  /** API key for token-less requests. Omit to fail closed (no fallback identity). */
  apikey?: string
  /** Send the apikey even alongside a user token (default: token is exclusive). */
  apikeyWithToken?: boolean
  /** Reject with 401 unless the request has a valid user token (for privileged backends). */
  requireToken?: boolean
}

// Per-backend config in tlv2proxy.backends (name-keyed); the path is derived as
// `${prefix}/${name}` when the auto-register plugin registers it.
export interface ProxyBackendConfig {
  base: string
  apikey?: string
  apikeyWithToken?: boolean
  requireToken?: boolean
}

const REGISTRY_KEY = '__tlv2AuthProxyRegistry'

function store (): Map<string, ProxyBackend> {
  const g = globalThis as Record<string, unknown>
  let registry = g[REGISTRY_KEY] as Map<string, ProxyBackend> | undefined
  if (!registry) {
    registry = new Map<string, ProxyBackend>()
    g[REGISTRY_KEY] = registry
  }
  return registry
}

function normalizePath (path: string): string {
  // Trim trailing slashes by index scan, not /\/+$/ — that backtracks
  // polynomially on long runs of '/' (CodeQL js/polynomial-redos).
  let end = path.length
  while (end > 0 && path[end - 1] === '/') {
    end--
  }
  const trimmed = path.slice(0, end)
  if (!trimmed.startsWith('/')) {
    throw new Error(`[tlv2-auth] proxy backend path must start with "/", got: "${path}"`)
  }
  return trimmed
}

/** Register a proxy backend (re-registering a path overwrites it). */
export function defineProxyBackend (backend: ProxyBackend): void {
  const path = normalizePath(backend.path)
  if (!/^https?:\/\//.test(backend.proxyBase)) {
    throw new Error(`[tlv2-auth] proxy backend "${path}" requires an absolute http(s) proxyBase, got: "${backend.proxyBase}"`)
  }
  store().set(path, { ...backend, path })
}

/** All registered backends, longest path first. */
export function listProxyBackends (): ProxyBackend[] {
  return [...store().values()].sort((a, b) => b.path.length - a.path.length)
}

/** Match a request path to a backend by longest prefix; returns it plus the stripped path (query kept), or null. */
export function matchProxyBackend (
  requestPath: string
): { backend: ProxyBackend, strippedPath: string } | null {
  const qIndex = requestPath.indexOf('?')
  const pathname = qIndex === -1 ? requestPath : requestPath.slice(0, qIndex)
  const query = qIndex === -1 ? '' : requestPath.slice(qIndex)
  let best: ProxyBackend | null = null
  for (const backend of store().values()) {
    const matches = pathname === backend.path || pathname.startsWith(`${backend.path}/`)
    if (matches && (!best || backend.path.length > best.path.length)) {
      best = backend
    }
  }
  if (!best) {
    return null
  }
  const rest = pathname.slice(best.path.length) || '/'
  return { backend: best, strippedPath: rest + query }
}
