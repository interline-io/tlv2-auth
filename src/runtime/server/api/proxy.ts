import { defineEventHandler, createError, getQuery, isError, setResponseStatus } from 'h3'
import type { H3Error, H3Event } from 'h3'
import { useNitroApp } from 'nitropack/runtime'
import { useRuntimeConfig } from '#imports'
import { proxyHandler } from '../../util/proxy'
import { buildProxyHeaders, parseProxyRoute, stripApikeyParam } from '../../util/proxy-route'
import { resolveProxyBackends } from '../../util/backends'
import { DEFAULT_PROXY_PREFIX } from '../../util/defaults'
import { traceEnabled, trace } from '../../util/log'
import { useAuth0Session } from '../useSession'
import type { ProxyRequest } from '../proxyRequest'

// Dispatches a proxy request to a configured backend (tlv2proxy.backends),
// applying that backend's auth policy (token-exclusive apikey + requireToken),
// then the app's tlv2proxy:request hooks.
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const prefix = config.public?.tlv2proxy?.prefix || DEFAULT_PROXY_PREFIX
  const route = parseProxyRoute(event.path || '', prefix)
  const backend = route ? resolveProxyBackends(config)[route.name] : undefined
  if (!route || !backend?.base) {
    return refuse(event, createError({ statusCode: 404, statusMessage: 'Not Found', message: '[tlv2-proxy] Unknown proxy backend' }))
  }

  const auth = await useAuth0Session(event)

  // Fail closed without a usable token so a request never borrows the shared
  // apikey identity: a requireToken backend, a logged-in-but-degraded session, or
  // an app-wide requireLogin all 401. Genuinely anonymous callers get the apikey
  // fallback only when the app permits it (requireLogin off, backend not requireToken).
  const requireLogin = config.public?.tlv2?.requireLogin
  if (!auth.accessToken && (backend.requireToken || auth.loggedIn || requireLogin)) {
    return refuse(event, createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: auth.loggedIn
        ? '[tlv2-proxy] Session degraded; re-authentication required'
        : '[tlv2-proxy] Authentication required'
    }))
  }

  const query = getQuery(event)
  const requestApikey = (query.apikey ? query.apikey.toString() : '') || event.headers.get('apikey') || ''
  const headers = buildProxyHeaders(backend.apikey, auth.accessToken, requestApikey, backend.apikeyWithToken)
  // The caller's apikey goes in `headers` when policy allows it, never on the
  // forwarded URL, and never to a hook that might log the path.
  const path = stripApikeyParam(route.strippedPath)

  const request: ProxyRequest = {
    event,
    backend: route.name,
    path,
    sharedApikey: !!backend.apikey && headers.apikey === backend.apikey
  }
  try {
    await useNitroApp().hooks.callHook('tlv2proxy:request', request)
  } catch (err) {
    // A refusal is an answer; anything else is a failure for Nitro to report.
    if (isError(err) && err.statusCode < 500) {
      if (traceEnabled) {
        trace('proxy — refused by a tlv2proxy:request hook:', err.statusCode, err.message)
      }
      return refuse(event, err)
    }
    throw err
  }

  return proxyHandler(event, { base: backend.base, path, headers, body: request.body })
})

// Answers a refusal as JSON whatever the request accepts. A proxy URL is never a
// page, and a thrown error would render Nuxt's HTML error page for a navigation,
// such as a download link.
function refuse (event: H3Event, error: H3Error) {
  setResponseStatus(event, error.statusCode, error.statusMessage)
  return { statusCode: error.statusCode, statusMessage: error.statusMessage, message: error.message }
}
