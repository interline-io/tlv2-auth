// A proxy backend, keyed by name in tlv2proxy.backends.
export interface ProxyBackendConfig {
  // The upstream base URL.
  base: string
}

// The part of runtime config that holds the proxy backends.
export interface ProxyConfig {
  tlv2proxy?: { backends?: Record<string, ProxyBackendConfig> }
}
