import type { Plugin } from '#app'
import { defineNuxtPlugin, useState, useRuntimeConfig } from '#imports'
import { getSessionUser } from '../server/sessionUser'

// SSR role enrichment: resolve the user's roles during the server render and
// put them in useState so they serialize into the payload. The page renders
// with roles and the client hydrates identically — no flash, no hydration
// mismatch. The `tlv2_ssr_enriched` flag tells the client middleware to adopt
// these and skip its own fetch. Anonymous and degraded sessions fall through to
// the client for its own handling (login gate / degraded recovery).
const plugin: Plugin = defineNuxtPlugin(async (nuxtApp) => {
  const event = nuxtApp.ssrContext?.event
  if (!event) {
    return
  }
  const user = await getSessionUser(event, useRuntimeConfig())
  // Only hand roles to the client when enrichment actually ran: enrichUserClaims
  // adds `tlv2_roles` only on a successful `me` fetch, so its absence means the
  // query failed or timed out (or no backend is configured). Leave the flag
  // unset in that case so the client re-fetches rather than adopting empty roles.
  if (!user || user.tlv2_degraded || !Array.isArray(user.tlv2_roles)) {
    return
  }
  useState<string[]>('tlv2_user_roles', () => []).value = [...user.tlv2_roles].sort()
  useState<string>('tlv2_user_id', () => '').value = user.tlv2_id || ''
  useState<Record<string, any> | undefined>('tlv2_user_me', () => undefined).value = user.tlv2_me
  useState<boolean>('tlv2_ssr_enriched', () => false).value = true
})
export default plugin
