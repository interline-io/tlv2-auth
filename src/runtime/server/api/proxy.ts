import { defineEventHandler, createError, getCookie, getHeader } from 'h3'
import { useRuntimeConfig } from '#imports'
import { proxyHandler } from '../../util/proxy'
import { parseProxyRoute } from '../../util/proxy-route'
import { resolveProxyBackends } from '../../util/backends'
import { DEFAULT_PROXY_PREFIX } from '../../util/defaults'
import { CSRF_COOKIE, CSRF_HEADER, isSafeMethod } from '../../util/csrf'
import { csrfSecret, verifyCsrfToken, csrfDoubleSubmitOk } from '../csrf'
import { useAuth0Session } from '../useSession'

// Dispatches a proxy request to a configured backend (tlv2proxy.backends),
// applying that backend's auth policy (token-exclusive apikey + requireToken).
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const prefix = config.public?.tlv2proxy?.prefix || DEFAULT_PROXY_PREFIX
  const route = parseProxyRoute(event.path || '', prefix)
  const backend = route ? resolveProxyBackends(config)[route.name] : undefined
  if (!route || !backend?.base) {
    throw createError({ statusCode: 404, message: '[tlv2-proxy] Unknown proxy backend' })
  }

  // CSRF / anti-abuse gate. Every request needs a validly-signed tlv2_csrf
  // cookie — issued only to clients that loaded a page, so tokenless scripts
  // 403. Unsafe methods must additionally echo it as a header (double-submit),
  // which cross-origin callers can't forge; safe GETs skip the header so
  // navigation downloads and <a> links (which can't set headers) still work.
  const secret = csrfSecret(config)
  const cookieToken = getCookie(event, CSRF_COOKIE)
  const csrfOk = isSafeMethod(event.method || 'GET')
    ? await verifyCsrfToken(cookieToken, secret)
    : await csrfDoubleSubmitOk(cookieToken, getHeader(event, CSRF_HEADER), secret)
  if (!csrfOk) {
    throw createError({ statusCode: 403, message: '[tlv2-proxy] Missing or invalid CSRF token' })
  }

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
    backend.base,
    backend.apikey || '',
    auth.accessToken,
    route.strippedPath,
    backend.apikeyWithToken
  )
})
