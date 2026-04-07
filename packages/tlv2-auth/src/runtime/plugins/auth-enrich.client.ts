import { defineNuxtPlugin, addRouteMiddleware, useState, useRuntimeConfig } from '#imports'
import { useLogin } from '../composables/useLogin'

const RECHECK_INTERVAL = 600_000

export default defineNuxtPlugin(() => {
  addRouteMiddleware('auth-enrich', async () => {
    const auth0User = useState<Record<string, any> | undefined>('auth0_user')
    const lastChecked = useState<number>('tlv2_auth_last_checked', () => 0)

    // Check freshness — skip if recently checked
    const now = Date.now()
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
        const session = await $fetch('/api/auth/session')
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

      // Redirect to login if requireLogin is set
      const config = useRuntimeConfig()
      if (config.public.tlv2?.requireLogin) {
        return useLogin(null)
      }
      return
    }

    // Populate roles from session response (enriched server-side)
    const roles = useState<string[]>('tlv2_user_roles', () => [])
    const graphqlId = useState<string>('tlv2_user_id', () => '')
    roles.value = [...(auth0User.value.tlv2_roles || [])].sort()
    graphqlId.value = auth0User.value.tlv2_id || ''
    lastChecked.value = Date.now()
  }, {
    global: true
  })
})
