import type { ProxyBackendConfig } from '../server/proxy-registry'

interface ProxyConfig {
  tlv2proxy?: { backends?: Record<string, ProxyBackendConfig> }
  // Legacy (migration): tlv2.proxyBase.default (endpoint) + tlv2.graphqlApikey.
  tlv2?: { graphqlApikey?: string, proxyBase?: Record<string, string> }
}

// Resolve the configured proxy backends. TEMPORARY migration bridge: folds the
// legacy NUXT_TLV2_PROXY_BASE_DEFAULT + NUXT_TLV2_GRAPHQL_APIKEY into the
// `default` backend when tlv2proxy leaves them unset. Drop the legacy branch
// once consumers move to tlv2proxy.backends.
export function resolveProxyBackends (config: ProxyConfig): Record<string, ProxyBackendConfig> {
  const backends = { ...(config.tlv2proxy?.backends || {}) }
  const legacyBase = config.tlv2?.proxyBase?.default
  const legacyApikey = config.tlv2?.graphqlApikey
  if (legacyBase || legacyApikey) {
    const d = backends.default
    backends.default = {
      base: d?.base || legacyBase || '',
      apikey: d?.apikey || legacyApikey,
      apikeyWithToken: d?.apikeyWithToken,
      requireToken: d?.requireToken
    }
  }
  return backends
}
