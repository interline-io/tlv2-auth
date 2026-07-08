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
// tlv2.proxyBase.<name> (+ tlv2.graphqlApikey for `default`) into any backend NOT
// declared in tlv2proxy.backends — a declared backend is never merged into, so a
// keyless default stays fail-closed. Gate on this resolved view, not raw
// tlv2proxy.backends. Drop once consumers migrate.
export function resolveProxyBackends (config: ProxyConfig): Record<string, ProxyBackendConfig> {
  const backends = { ...(config.tlv2proxy?.backends || {}) }
  const legacyApikey = config.tlv2?.graphqlApikey
  for (const [name, base] of Object.entries(config.tlv2?.proxyBase || {})) {
    if (base && !backends[name]) {
      backends[name] = {
        base,
        ...(name === 'default' && legacyApikey ? { apikey: legacyApikey } : {})
      }
    }
  }
  return backends
}
