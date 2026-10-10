import { computed, reactive } from 'vue'
import type { Ref } from 'vue'
import type { TlMe, TlUser } from '../composables/useUser'

// Builds a reactive TlUser over the auth0 claims and GraphQL `me` refs.
export function makeUser (
  auth0User: Ref<Record<string, any> | undefined>,
  me: Ref<TlMe | undefined>
): TlUser {
  const roles = computed(() => [...(me.value?.roles || [])].sort())
  return reactive({
    loggedIn: computed(() => !!auth0User.value),
    id: computed(() => me.value?.id || auth0User.value?.sub || ''),
    name: computed(() => auth0User.value?.name || me.value?.name || ''),
    email: computed(() => auth0User.value?.email || me.value?.email || ''),
    roles,
    // A computed, not the bare ref: reactive() writes through to ref properties,
    // so `user.me = x` would overwrite the shared session state.
    me: computed(() => me.value),
    externalData: computed(() => me.value?.external_data || {}),
    hasRole: (v: string) => roles.value.includes(v)
  }) as TlUser
}
