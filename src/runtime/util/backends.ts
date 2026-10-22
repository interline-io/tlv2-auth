// A proxy backend, keyed by name in tlv2proxy.backends.
export interface ProxyBackendConfig {
  // The upstream base URL.
  base: string
  // 401 a request without a signed-in user's token, before any hook runs.
  requireToken?: boolean
}

// The part of runtime config that holds the proxy backends.
export interface ProxyConfig {
  tlv2proxy?: { backends?: Record<string, ProxyBackendConfig> }
}

// The configured backends by name, typed for lookup by any name rather than by
// the app's own declaration, which names only its backends.
export function proxyBackends (config: ProxyConfig): Record<string, ProxyBackendConfig> {
  return config.tlv2proxy?.backends ?? {}
}
