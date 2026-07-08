// Type augmentations for runtime config.
// auth0-nuxt is installed dynamically via installModule() so its type
// augmentations aren't visible during `nuxt typecheck` at the module level.
// We declare the shapes we depend on here.
import type { ProxyBackendConfig } from './server/proxy-registry'

declare module 'nuxt/schema' {
  interface RuntimeConfig {
    auth0: {
      domain: string
      clientId: string
      clientSecret: string
      appBaseUrl: string
      sessionSecret: string
      audience: string
    }
    tlv2: {
      autoAppBaseUrl: boolean
      // Legacy (migration): folded into tlv2proxy.backends.default.
      graphqlApikey?: string
      proxyBase?: Record<string, string>
    }
    tlv2proxy: {
      backends: Record<string, ProxyBackendConfig>
    }
  }
  interface PublicRuntimeConfig {
    tlv2: {
      loginGate: boolean
      requireLogin: boolean
      authPrefix: string
    }
    tlv2proxy: {
      prefix: string
    }
  }
}

declare module 'h3' {
  interface H3EventContext {
    auth0Disabled: boolean
  }
}

export {}
