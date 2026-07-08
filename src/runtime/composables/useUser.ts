import { useState } from '#imports'
import type { Ref } from 'vue'

// The GraphQL `me` response (schema `type Me`). external_data is an open map of
// extra identifiers/metadata associated with the user.
export interface TlMe {
  id: string
  name: string | null
  email: string | null
  roles: string[] | null
  external_data: Record<string, string>
}

export interface TlUser {
  loggedIn: boolean
  id: string
  name: string
  email: string
  roles: string[]
  // The full GraphQL `me` response; undefined until enrichment resolves.
  me: TlMe | undefined
  // Convenience accessor for `me.external_data` (empty when absent).
  externalData: Record<string, string>
  hasRole: (v: string) => boolean
}

// auth0-nuxt populates useState('auth0_user') with OIDC claims
const useAuth0User = () => useState<Record<string, any> | undefined>('auth0_user')

// State keys for the enriched `me` data (populated on SSR and/or client)
const useRoles = (): Ref<string[]> => useState<string[]>('tlv2_user_roles', () => [])
const useGraphqlId = (): Ref<string> => useState<string>('tlv2_user_id', () => '')
const useMe = (): Ref<TlMe | undefined> => useState<TlMe | undefined>('tlv2_user_me', () => undefined)

export const useUser = (): TlUser => {
  const auth0User = useAuth0User()
  const roles = useRoles()
  const graphqlId = useGraphqlId()
  const me = useMe()

  const loggedIn = !!auth0User.value
  return {
    loggedIn,
    id: graphqlId.value || auth0User.value?.tlv2_id || auth0User.value?.sub || '',
    name: auth0User.value?.name || auth0User.value?.tlv2_name || '',
    email: auth0User.value?.email || auth0User.value?.tlv2_email || '',
    roles: roles.value,
    me: me.value,
    externalData: me.value?.external_data || {},
    hasRole (v: string): boolean {
      return roles.value.includes(v)
    }
  }
}
