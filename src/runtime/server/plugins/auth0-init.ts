import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
import { getRequestHeader } from 'h3'

// Synchronous Nitro plugin that ensures auth0ClientOptions is populated on
// each request. No-ops when auth0-nuxt's own async plugin already ran.
// Required for Cloudflare Workers compatibility where async Nitro plugins
// don't complete before the first request.
//
// When autoAppBaseUrl is enabled, derives appBaseUrl from the request Host
// header instead of using the static config value. This is a convenience
// that patches the auth0 config per-request — useful for branch/preview
// deploys where the URL isn't known at build time (not CF-specific).
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    if (event.context.auth0ClientOptions) {
      return
    }
    const config = useRuntimeConfig(event)
    if (!config.auth0?.domain) {
      return
    }
    let { appBaseUrl } = config.auth0
    // Trusts x-forwarded-proto and Host headers — only safe behind a
    // trusted edge proxy (Cloudflare, Vercel, etc.)
    if (config.tlv2?.autoAppBaseUrl) {
      const host = getRequestHeader(event, 'host')
      const proto = getRequestHeader(event, 'x-forwarded-proto') || 'https'
      if (host) {
        appBaseUrl = `${proto}://${host}`
      }
    }
    event.context.auth0ClientOptions = {
      ...config.auth0,
      appBaseUrl,
    }
    event.context.auth0SessionStore = undefined
  })
})
