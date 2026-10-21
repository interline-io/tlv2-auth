import { defineEventHandler, getQuery, setResponseStatus } from 'h3'
import type { H3Event } from 'h3'
import { useNitroApp } from 'nitropack/runtime'
import { useRuntimeConfig } from '#imports'
import { proxyHandler } from '../../util/proxy'
import { CREDENTIAL_HEADERS, buildProxyHeaders, buildProxyTarget, parseProxyRoute, pathUnderBase, stripApikeyParam } from '../../util/proxy-route'
import { resolveProxyBackends } from '../../util/backends'
import { DEFAULT_PROXY_PREFIX } from '../../util/defaults'
import { traceEnabled, trace } from '../../util/log'
import { useAuth0Session } from '../useSession'
import type { ProxyRefusal, ProxyRequest } from '../proxyRequest'

// Dispatches a proxy request to a configured backend (tlv2proxy.backends),
// applying that backend's auth policy (token-exclusive apikey + requireToken),
// then the app's tlv2proxy:request hooks.
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const prefix = config.public?.tlv2proxy?.prefix || DEFAULT_PROXY_PREFIX
  const route = parseProxyRoute(event.path || '', prefix)
  const backend = route ? resolveProxyBackends(config)[route.name] : undefined
  if (!route || !backend?.base) {
    return refuse(event, { statusCode: 404, statusMessage: 'Not Found', message: '[tlv2-proxy] Unknown proxy backend' })
  }

  const auth = await useAuth0Session(event)

  // Fail closed without a usable token so a request never borrows the shared
  // apikey identity: a requireToken backend, a logged-in-but-degraded session, or
  // an app-wide requireLogin all 401. Genuinely anonymous callers get the apikey
  // fallback only when the app permits it (requireLogin off, backend not requireToken).
  const requireLogin = config.public?.tlv2?.requireLogin
  if (!auth.accessToken && (backend.requireToken || auth.loggedIn || requireLogin)) {
    return refuse(event, {
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: auth.loggedIn
        ? '[tlv2-proxy] Session degraded; re-authentication required'
        : '[tlv2-proxy] Authentication required'
    })
  }

  const query = getQuery(event)
  const requestApikey = (query.apikey ? query.apikey.toString() : '') || event.headers.get('apikey') || ''
  const headers = buildProxyHeaders(backend.apikey, auth.accessToken, requestApikey, backend.apikeyWithToken)
  // What goes upstream, so a hook judges the path the backend receives: dot
  // segments resolved, and the caller's apikey, which goes in `headers` when
  // policy allows it, removed. A path that escapes the base names nothing the
  // proxy serves.
  const target = buildProxyTarget(backend.base, stripApikeyParam(route.strippedPath))
  if (!target) {
    return refuse(event, { statusCode: 404, statusMessage: 'Not Found', message: '[tlv2-proxy] Path is outside the proxy backend' })
  }
  const path = pathUnderBase(backend.base, target)

  const request: ProxyRequest = {
    event,
    backend: route.name,
    path,
    sharedApikey: !!backend.apikey && headers.apikey === backend.apikey,
    headers: {}
  }
  await useNitroApp().hooks.callHook('tlv2proxy:request', request)
  if (request.refusal) {
    if (traceEnabled) {
      trace('proxy — refused by a tlv2proxy:request hook:', request.refusal.statusCode, request.refusal.message)
    }
    return refuse(event, request.refusal)
  }

  // Credentials are the proxy's policy alone, so a hook that sets one is a bug:
  // logged, and answered as a failure rather than forwarded.
  const claimed = Object.keys(request.headers).find(name => CREDENTIAL_HEADERS.includes(name.toLowerCase()))
  if (claimed) {
    console.error(`[tlv2-proxy] A tlv2proxy:request hook set the credential header ${claimed}; refusing the request`)
    return refuse(event, { statusCode: 500, statusMessage: 'Internal Server Error', message: '[tlv2-proxy] A tlv2proxy:request hook set a credential header' })
  }

  return proxyHandler(event, { target, headers: { ...request.headers, ...headers }, body: request.body })
})

// Answers a refusal as JSON whatever the request accepts. A proxy URL is never a
// page, and a thrown error would render Nuxt's HTML error page for a navigation,
// such as a download link.
function refuse (event: H3Event, refusal: ProxyRefusal) {
  setResponseStatus(event, refusal.statusCode, refusal.statusMessage)
  return { statusCode: refusal.statusCode, statusMessage: refusal.statusMessage, message: refusal.message }
}
