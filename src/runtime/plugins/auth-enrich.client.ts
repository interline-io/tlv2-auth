import type { Plugin } from '#app'
import { defineNuxtPlugin, addRouteMiddleware, useState, useRuntimeConfig } from '#imports'
import { useLogin } from '../composables/useLogin'
import { useLogoutLocal } from '../composables/useLogoutLocal'
import { DEFAULT_AUTH_PREFIX } from '../util/defaults'

const REAUTH_KEY = 'tlv2_reauth_attempts'

const plugin: Plugin = defineNuxtPlugin(() => {
  addRouteMiddleware('auth-enrich', async () => {
    // Resolve auth state once per page load (SSR seeds it, or we fetch below);
    // a reload picks up new roles or a changed session. Roles are UI-gating only
    // — the server enforces real permissions — so a stale view until reload is fine.
    const resolved = useState<boolean>('tlv2_auth_resolved', () => false)
    if (resolved.value) {
      return
    }

    const auth0User = useState<Record<string, any> | undefined>('auth0_user')
    const me = useState<Record<string, any> | undefined>('tlv2_user_me', () => undefined)
    const config = useRuntimeConfig()

    // Fetch the session for the enriched `me` / degraded state. If the endpoint
    // is unreachable, leave unresolved so the next navigation retries rather than
    // flashing a logged-out UI on a transient blip.
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
      me.value = undefined
      sessionStorage.removeItem(REAUTH_KEY)
      resolved.value = true
      if (config.public.tlv2?.requireLogin) {
        return useLogin(null)
      }
      return
    }

    // Degraded (logged in, no usable token): recover once via a silent re-login,
    // else log out locally. The one-shot guard (which survives the auth0 round-trip)
    // bounds it to a single re-login so it can't loop.
    if (auth0User.value.tlv2_degraded) {
      if (!sessionStorage.getItem(REAUTH_KEY)) {
        sessionStorage.setItem(REAUTH_KEY, '1')
        return useLogin(null)
      }
      return useLogoutLocal()
    }

    me.value = auth0User.value.tlv2_me
    sessionStorage.removeItem(REAUTH_KEY)
    // Resolve only when enrichment produced `me`; if it failed/timed out, leave
    // unresolved so the next navigation retries.
    if (auth0User.value.tlv2_me) {
      resolved.value = true
    }
  }, {
    global: true
  })
})
export default plugin
