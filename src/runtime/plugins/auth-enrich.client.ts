import type { Plugin } from '#app'
import { defineNuxtPlugin, addRouteMiddleware, useState, useRuntimeConfig } from '#imports'
import { useLogin } from '../composables/useLogin'
import { useLogoutLocal } from '../composables/useLogoutLocal'
import { DEFAULT_AUTH_PREFIX } from '../util/defaults'

const RECHECK_INTERVAL = 600_000
const REAUTH_KEY = 'tlv2_reauth_attempts'

const plugin: Plugin = defineNuxtPlugin(() => {
  addRouteMiddleware('auth-enrich', async () => {
    const auth0User = useState<Record<string, any> | undefined>('auth0_user')
    const lastChecked = useState<number>('tlv2_auth_last_checked', () => 0)
    const ssrEnriched = useState<boolean>('tlv2_ssr_enriched', () => false)

    const now = Date.now()

    // Roles were enriched during SSR and are already in the payload (see
    // auth-enrich.server) — adopt them and skip the fetch so they don't flash.
    // Consume the flag; later SPA navigations fall through to the freshness-
    // gated re-check below.
    if (ssrEnriched.value) {
      ssrEnriched.value = false
      lastChecked.value = now
      return
    }

    // Check freshness — skip if recently checked
    if (lastChecked.value && (now - lastChecked.value) < RECHECK_INTERVAL) {
      return
    }

    // On first client-side run, if auth0-nuxt already populated auth0_user
    // during SSR but without roles, we still need to fetch the session
    // endpoint to get roles. However, if auth0_user already has tlv2_roles
    // (e.g. from a prior enrichment that survived hydration), skip the fetch.
    const needsFetch = !auth0User.value || !auth0User.value.tlv2_roles
    if (needsFetch) {
      try {
        const config = useRuntimeConfig()
        const authPrefix = config.public.tlv2?.authPrefix || DEFAULT_AUTH_PREFIX
        const session = await $fetch(`${authPrefix}/session`)
        auth0User.value = session || undefined
      } catch (e) {
        console.warn('[tlv2-auth] Failed to fetch session:', e)
      }
    }

    if (!auth0User.value) {
      // Not logged in — clear enriched data
      const roles = useState<string[]>('tlv2_user_roles', () => [])
      const graphqlId = useState<string>('tlv2_user_id', () => '')
      roles.value = []
      graphqlId.value = ''
      lastChecked.value = 0
      sessionStorage.removeItem(REAUTH_KEY)

      // Redirect to login if requireLogin is set
      const config = useRuntimeConfig()
      if (config.public.tlv2?.requireLogin) {
        return useLogin(null)
      }
      return
    }

    // Degraded session: logged in, but the server has no usable access token
    // (refresh expired/failed). Try once to recover, then log out locally. A
    // plain re-login silently restores the session when the auth0 SSO session is
    // still alive (the common case — offline_access is on, so this only fires
    // when the refresh token itself died) and otherwise lands on the login page;
    // if we return still degraded, a local logout clears the dead session but
    // keeps the SSO session, so re-login stays silent. The one-shot guard bounds
    // it to a single re-login so it can't loop.
    if (auth0User.value.tlv2_degraded) {
      if (!sessionStorage.getItem(REAUTH_KEY)) {
        sessionStorage.setItem(REAUTH_KEY, '1')
        return useLogin(null)
      }
      return useLogoutLocal()
    }

    // Populate roles from session response (enriched server-side)
    const roles = useState<string[]>('tlv2_user_roles', () => [])
    const graphqlId = useState<string>('tlv2_user_id', () => '')
    roles.value = [...(auth0User.value.tlv2_roles || [])].sort()
    graphqlId.value = auth0User.value.tlv2_id || ''
    lastChecked.value = Date.now()
    sessionStorage.removeItem(REAUTH_KEY)
  }, {
    global: true
  })
})
export default plugin
