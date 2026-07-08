import type { Plugin } from '#app'
import { defineNuxtPlugin, useState, useRuntimeConfig } from '#imports'
import { getSessionUser } from '../server/sessionUser'

// SSR enrichment: resolve the user during server render and put the `me` data in
// useState so it serializes into the payload; mark auth resolved so the client
// adopts it and skips its own fetch. Anonymous/degraded sessions fall through to
// the client for its own handling.
const plugin: Plugin = defineNuxtPlugin(async (nuxtApp) => {
  const event = nuxtApp.ssrContext?.event
  if (!event) {
    return
  }
  const user = await getSessionUser(event, useRuntimeConfig())
  // tlv2_me is present only when the `me` fetch succeeded; skip the handoff
  // otherwise so the client re-fetches rather than adopting nothing.
  if (!user || user.tlv2_degraded || !user.tlv2_me) {
    return
  }
  useState<Record<string, any> | undefined>('tlv2_user_me', () => undefined).value = user.tlv2_me
  useState<boolean>('tlv2_auth_resolved', () => false).value = true
})
export default plugin
