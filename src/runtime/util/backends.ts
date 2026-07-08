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

// Resolve the configured proxy backends. TEMPORARY migration bridge: maps the
// legacy tlv2.proxyBase.<name> endpoints (+ tlv2.graphqlApikey for `default`)
// into any backend the consumer has NOT declared in tlv2proxy.backends.
// Precedence is object-level: a declared backend is never merged into, so an
// intentionally keyless default stays fail-closed even if a stale
// NUXT_TLV2_GRAPHQL_APIKEY lingers in the environment. Drop this once consumers
// move fully to tlv2proxy.backends. (Note: this resolved view is not reflected
// in the raw runtimeConfig — a consumer that gates on backend.apikey should
// resolve through this function, not read tlv2proxy.backends directly.)
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
