import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
import { resolveMeEndpoint } from '../../util/backends'
import { AUTH0_PLACEHOLDER_DOMAIN } from '../../util/defaults'

// Logs where the session's `me` lookup goes once at server startup, and warns
// when it has no backend to use, since signed-in users then get no roles.
export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  // Without auth0 nobody signs in, so no lookup ever runs.
  if (config.auth0?.domain === AUTH0_PLACEHOLDER_DOMAIN) {
    return
  }
  const endpoint = resolveMeEndpoint(config)
  if (endpoint) {
    console.log(`[tlv2-auth] me lookup → ${endpoint.url}`)
  } else {
    console.warn(`[tlv2-auth] tlv2proxy.meBackend "${config.tlv2proxy?.meBackend}" names no backend with a base — signed-in users get no roles`)
  }
})
