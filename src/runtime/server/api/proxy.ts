import { defineEventHandler, createError } from 'h3'
import { proxyHandler } from '../../util/proxy'
import { matchProxyBackend } from '../proxy-registry'
import { useAuth0Session } from '../useSession'

// Dispatches a proxy request to a consumer-registered backend (see
// defineProxyBackend). Each backend declares its own auth policy: whether an
// apikey is injected as a fallback identity, and whether a missing/expired user
// token fails closed instead of degrading to that fallback.
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

  if ((backend.requireLogin || backend.requireToken) && !auth.loggedIn) {
    throw createError({
      statusCode: 401,
      message: '[tlv2-proxy] Authentication required'
    })
  }
  if (backend.requireToken && !auth.accessToken) {
    // Logged in but no valid access token — the degraded window. Fail closed
    // rather than fall back to the backend's apikey identity.
    throw createError({
      statusCode: 401,
      message: '[tlv2-proxy] Session degraded; re-authentication required'
    })
  }

  return proxyHandler(
    event,
    backend.proxyBase,
    backend.apikey || '',
    auth.accessToken,
    strippedPath
  )
})
