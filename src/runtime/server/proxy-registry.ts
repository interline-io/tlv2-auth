// Server-only registry of proxy backends.
//
// Consumers register backends — typically once each from a nitro plugin — with
// defineProxyBackend(); the proxy dispatch handler reads them back. This mirrors
// the database/sql driver pattern: registration is a startup side effect, and
// dispatch is a lookup keyed on the registered path.
//
// This module holds API keys and MUST NOT be imported into the client bundle.
// The registry is stored on globalThis so a single instance is shared across
// the server bundle even if the module is evaluated more than once.

export interface ProxyBackend {
  /**
   * Full request path this backend serves, e.g. '/proxy/stationEditor'. Matched
   * as a prefix; the matched portion is stripped before forwarding upstream.
   * Must live under the mount root (proxyPrefix) for requests to reach it.
   */
  path: string
  /** Upstream base URL matched requests are forwarded to. */
  proxyBase: string
  /**
   * API key injected when the request carries no user token. Omit to fail
   * closed: a backend with no key never falls back to a shared identity, so a
   * logged-out or token-less request reaches the upstream unauthenticated.
   */
  apikey?: string
  /**
   * Reject with 401 unless the request has a logged-in session with a valid
   * access token. Use for privileged backends whose data must never be served
   * to a degraded (token-less) session.
   */
  requireToken?: boolean
  /** Reject anonymous requests with 401 (implied by requireToken). */
  requireLogin?: boolean
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
  const trimmed = path.replace(/\/+$/, '')
  if (!trimmed.startsWith('/')) {
    throw new Error(`[tlv2-auth] proxy backend path must start with "/", got: "${path}"`)
  }
  return trimmed
}

/**
 * Register a proxy backend. Call once per backend, typically from a nitro
 * plugin. Re-registering the same path overwrites the previous entry (HMR-safe).
 */
export function defineProxyBackend (backend: ProxyBackend): void {
  const path = normalizePath(backend.path)
  if (!/^https?:\/\//.test(backend.proxyBase)) {
    throw new Error(`[tlv2-auth] proxy backend "${path}" requires an absolute http(s) proxyBase, got: "${backend.proxyBase}"`)
  }
  store().set(path, { ...backend, path })
}

/** All registered backends, longest path first so nested paths win. */
export function listProxyBackends (): ProxyBackend[] {
  return [...store().values()].sort((a, b) => b.path.length - a.path.length)
}

/**
 * Match a request path to a backend by longest path prefix. Returns the backend
 * and the remaining path (query preserved) to forward, or null when unmatched.
 */
export function matchProxyBackend (
  requestPath: string
): { backend: ProxyBackend, strippedPath: string } | null {
  const qIndex = requestPath.indexOf('?')
  const pathname = qIndex === -1 ? requestPath : requestPath.slice(0, qIndex)
  const query = qIndex === -1 ? '' : requestPath.slice(qIndex)
  // Single pass tracking the longest matching prefix — no per-request sort.
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
