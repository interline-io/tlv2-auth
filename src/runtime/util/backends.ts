// Per-backend proxy config, keyed by name in tlv2proxy.backends.
export interface ProxyBackendConfig {
  base: string
  apikey?: string
  apikeyWithToken?: boolean
  requireToken?: boolean
}

interface ProxyConfig {
  tlv2proxy?: { backends?: Record<string, ProxyBackendConfig> }
  // Legacy (migration): tlv2.proxyBase.default (endpoint) + tlv2.graphqlApikey.
  tlv2?: { graphqlApikey?: string, proxyBase?: Record<string, string> }
}

// Resolve the configured proxy backends. TEMPORARY migration bridge: maps legacy
// tlv2.proxyBase.<name> into any backend NOT declared in tlv2proxy.backends, and
// injects tlv2.graphqlApikey on each — reproducing main, which attached the single
// shared key to every backend it proxied. A declared backend is never merged into,
// so migrating one to fail-closed just means declaring it (keyless) in
// tlv2proxy.backends. Gate on this resolved view, not raw tlv2proxy.backends.
// Drop once consumers migrate.
export function resolveProxyBackends (config: ProxyConfig): Record<string, ProxyBackendConfig> {
  const backends = { ...(config.tlv2proxy?.backends || {}) }
  const legacyApikey = config.tlv2?.graphqlApikey
  for (const [name, base] of Object.entries(config.tlv2?.proxyBase || {})) {
    if (base && !backends[name]) {
      backends[name] = {
        base,
        ...(legacyApikey ? { apikey: legacyApikey } : {})
      }
    }
  }
  return backends
}

// The proxy config with the session's `me` lookup settings beside the backends.
export interface SessionProxyConfig extends ProxyConfig {
  tlv2proxy?: { meBackend?: string, mePath?: string, backends?: Record<string, ProxyBackendConfig> }
}

// Where the session's `me` lookup goes.
export interface MeEndpoint {
  // The backend tlv2proxy.meBackend names; the lookup follows its credential rules.
  backend: ProxyBackendConfig
  // That backend's base plus tlv2proxy.mePath.
  url: string
}

// The session's `me` lookup target, or undefined when the backend
// tlv2proxy.meBackend names is not declared or has no base.
export function resolveMeEndpoint (config: SessionProxyConfig): MeEndpoint | undefined {
  const name = config.tlv2proxy?.meBackend
  const backend = name ? resolveProxyBackends(config)[name] : undefined
  if (!backend?.base) {
    return undefined
  }
  return { backend, url: backend.base + (config.tlv2proxy?.mePath ?? '') }
}
