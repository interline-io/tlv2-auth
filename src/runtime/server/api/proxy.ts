import { defineEventHandler, createError } from 'h3'
import { proxyHandler } from '../../util/proxy'
import { matchProxyBackend } from '../proxy-registry'
import { useAuth0Session } from '../useSession'

// Dispatches a proxy request to a registered backend, applying that backend's
// auth policy (apikey injection + requireToken).
export default defineEventHandler(async (event) => {
  const matched = matchProxyBackend(event.path || '')
  if (!matched) {
    throw createError({
      statusCode: 404,
      message: '[tlv2-proxy] No proxy backend registered for this path'
    })
  }
  const { backend, strippedPath } = matched

  const auth = await useAuth0Session(event)

  // A requireToken backend fails closed without a valid token — never falling
  // back to the apikey identity — for both anonymous and degraded sessions.
  if (backend.requireToken && !auth.accessToken) {
    throw createError({
      statusCode: 401,
      message: auth.loggedIn
        ? '[tlv2-proxy] Session degraded; re-authentication required'
        : '[tlv2-proxy] Authentication required'
    })
  }

  return proxyHandler(
    event,
    backend.proxyBase,
    backend.apikey || '',
    auth.accessToken,
    strippedPath,
    backend.apikeyWithToken
  )
})
