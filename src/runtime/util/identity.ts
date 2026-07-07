// The identity backend — the auth module's own upstream for `me` role
// enrichment (session.get) and SSR credential injection (auth.server), resolved
// independently of the consumer-owned proxy registry. Falls back to the legacy
// default proxy backend / graphqlApikey when the identity config isn't set.

interface IdentityConfig {
  identityBase?: string
  identityApikey?: string
  graphqlApikey?: string
  proxyBase?: Record<string, string>
}

export function resolveIdentityBackend (tlv2?: IdentityConfig): { base: string, apikey: string } {
  return {
    base: tlv2?.identityBase || tlv2?.proxyBase?.default || '',
    apikey: tlv2?.identityApikey || tlv2?.graphqlApikey || ''
  }
}
