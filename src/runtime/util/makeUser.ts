import { computed, reactive } from 'vue'
import type { Ref } from 'vue'
import type { TlMe, TlUser } from '../composables/useUser'

// Builds the reactive user view over the two backing session refs. Returned as a
// reactive object so a held reference (`const user = useUser()`) reflects later
// session changes -- e.g. enrichment populating roles without a navigation.
// Access fields via the object (`user.loggedIn`); destructuring detaches
// reactivity, as with any reactive object -- use `toRefs` if you must destructure.
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
    me,
    externalData: computed(() => me.value?.external_data || {}),
    hasRole: (v: string) => roles.value.includes(v)
  }) as TlUser
}
