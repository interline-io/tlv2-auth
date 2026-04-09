// Type augmentations for runtime config.
// nuxt-csurf and auth0-nuxt are installed dynamically via installModule() so
// their type augmentations aren't visible during `nuxt typecheck` at the
// module level. We declare the shapes we depend on here.

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
      graphqlApikey: string
      proxyBase: Record<string, string>
      autoAppBaseUrl: boolean
    }
  }
  interface PublicRuntimeConfig {
    tlv2: {
      loginGate: boolean
      requireLogin: boolean
      authPrefix: string
      proxyPrefix: string
    }
  }
}

export {}
