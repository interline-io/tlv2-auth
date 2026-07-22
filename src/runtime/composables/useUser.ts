import { useState } from '#imports'
import type { Ref } from 'vue'
import { makeUser } from '../util/makeUser'

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

// auth0-nuxt populates auth0_user with OIDC claims; tlv2_user_me holds the
// enriched GraphQL `me` (seeded on SSR and/or fetched client-side).
const useAuth0User = () => useState<Record<string, any> | undefined>('auth0_user')
const useMe = (): Ref<TlMe | undefined> => useState<TlMe | undefined>('tlv2_user_me', () => undefined)

// Reactive so a held reference reflects later session changes (background refresh,
// enrichment populating roles without a navigation) -- see makeUser.
export const useUser = (): TlUser => makeUser(useAuth0User(), useMe())
