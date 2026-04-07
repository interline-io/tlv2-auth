import { useState } from '#imports'
import type { Ref } from 'vue'

export interface TlUser {
  loggedIn: boolean
  id: string
  name: string
  email: string
  roles: string[]
  hasRole: (v: string) => boolean
}

// auth0-nuxt populates useState('auth0_user') with OIDC claims
const useAuth0User = () => useState<Record<string, any> | undefined>('auth0_user')

// State keys for roles/id fetched from the GraphQL `me` endpoint
const useRoles = (): Ref<string[]> => useState<string[]>('tlv2_user_roles', () => [])
const useGraphqlId = (): Ref<string> => useState<string>('tlv2_user_id', () => '')

export const useUser = (): TlUser => {
  const auth0User = useAuth0User()
  const roles = useRoles()
  const graphqlId = useGraphqlId()

  const loggedIn = !!auth0User.value
  return {
    loggedIn,
    id: graphqlId.value || auth0User.value?.tlv2_id || auth0User.value?.sub || '',
    name: auth0User.value?.name || auth0User.value?.tlv2_name || '',
    email: auth0User.value?.email || auth0User.value?.tlv2_email || '',
    roles: roles.value,
    hasRole (v: string): boolean {
      return roles.value.includes(v)
    }
  }
}
