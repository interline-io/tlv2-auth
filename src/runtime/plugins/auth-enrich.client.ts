import type { Plugin } from '#app'
import { defineNuxtPlugin, addRouteMiddleware, useState, useRuntimeConfig } from '#imports'
import { useLogin } from '../composables/useLogin'
import { useLogoutLocal } from '../composables/useLogoutLocal'
import { DEFAULT_AUTH_PREFIX } from '../util/defaults'

const REAUTH_KEY = 'tlv2_reauth_attempts'

const plugin: Plugin = defineNuxtPlugin(() => {
  addRouteMiddleware('auth-enrich', async () => {
    const auth0User = useState<Record<string, any> | undefined>('auth0_user')
    const resolved = useState<boolean>('tlv2_auth_resolved', () => false)
    const ssrEnriched = useState<boolean>('tlv2_ssr_enriched', () => false)
    const roles = useState<string[]>('tlv2_user_roles', () => [])
    const graphqlId = useState<string>('tlv2_user_id', () => '')
    const me = useState<Record<string, any> | undefined>('tlv2_user_me', () => undefined)

    // Resolve auth state once per page load; a reload picks up new roles or a
    // changed session. Front-end roles are UI-gating only (the server enforces
    // real permissions), so a slightly stale client view until reload is fine.
    if (resolved.value) {
      return
    }

    // Roles were enriched during SSR (auth-enrich.server) and are already in the
    // payload — nothing to fetch.
    if (ssrEnriched.value) {
      ssrEnriched.value = false
      resolved.value = true
      return
    }

    const config = useRuntimeConfig()

    // Fetch the session for enriched claims (roles) / degraded state. If the
    // endpoint is unreachable, leave unresolved so the next navigation retries
    // rather than flashing a logged-out UI on a transient blip.
    try {
      const authPrefix = config.public.tlv2?.authPrefix || DEFAULT_AUTH_PREFIX
      const session = await $fetch(`${authPrefix}/session`)
      auth0User.value = session || undefined
    } catch (e) {
      console.warn('[tlv2-auth] Failed to fetch session:', e)
      return
    }

    if (!auth0User.value) {
      // Not logged in.
      roles.value = []
      graphqlId.value = ''
      me.value = undefined
      sessionStorage.removeItem(REAUTH_KEY)
      resolved.value = true
      if (config.public.tlv2?.requireLogin) {
        return useLogin(null)
      }
      return
    }

    // Degraded session (logged in, no usable token): try once to recover via a
    // silent re-login, then log out locally. The one-shot sessionStorage guard
    // (which survives the auth0 round-trip) bounds it to a single re-login so it
    // can't loop. On recovery the next page load resolves normally.
    if (auth0User.value.tlv2_degraded) {
      if (!sessionStorage.getItem(REAUTH_KEY)) {
        sessionStorage.setItem(REAUTH_KEY, '1')
        return useLogin(null)
      }
      return useLogoutLocal()
    }

    // Enriched (or a backend-less app that has no roles).
    roles.value = [...(auth0User.value.tlv2_roles || [])].sort()
    graphqlId.value = auth0User.value.tlv2_id || ''
    me.value = auth0User.value.tlv2_me
    sessionStorage.removeItem(REAUTH_KEY)
    resolved.value = true
  }, {
    global: true
  })
})
export default plugin
