import { defineEventHandler, getQuery, setResponseStatus } from 'h3'
import type { H3Event } from 'h3'
import { useNitroApp } from 'nitropack/runtime'
import { useRuntimeConfig } from '#imports'
import { proxyHandler } from '../../util/proxy'
import { CREDENTIAL_HEADERS, buildProxyHeaders, buildProxyTarget, parseProxyRoute, stripApikeyParam } from '../../util/proxy-route'
import type { ProxyBackendConfig } from '../../util/backends'
import { DEFAULT_PROXY_PREFIX } from '../../util/defaults'
import { traceEnabled, trace } from '../../util/log'
import { useAuth0Session } from '../useSession'
import type { ProxyRefusal, ProxyRequest } from '../proxyRequest'

// Forwards a proxy request to a configured backend (tlv2proxy.backends) under
// the caller's own credential, after the app's tlv2proxy:request hooks.
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const prefix = config.public?.tlv2proxy?.prefix || DEFAULT_PROXY_PREFIX
  const route = parseProxyRoute(event.path || '', prefix)
  // Widened from the app's own declaration, which names only its backends.
  const backends: Record<string, ProxyBackendConfig> = config.tlv2proxy?.backends ?? {}
  const backend = route ? backends[route.name] : undefined
  if (!route || !backend?.base) {
    return refuse(event, { statusCode: 404, statusMessage: 'Not Found', message: '[tlv2-proxy] Unknown proxy backend' })
  }

  const auth = await useAuth0Session(event)

  // A degraded session (logged in, no usable token) 401s here, before any hook
  // can send an app's key, so a known user re-authenticates rather than going out
  // under a shared identity. So does an anonymous caller of an app that requires login.
  const requireLogin = config.public?.tlv2?.requireLogin
  if (!auth.accessToken && (auth.loggedIn || requireLogin)) {
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
  const headers = buildProxyHeaders(auth.accessToken, requestApikey)

  // Hooks judge the path the backend receives: dot segments resolved, and the
  // caller's apikey removed, since `headers` carries the key.
  const requestPath = stripApikeyParam(route.strippedPath)
  const upstream = buildProxyTarget(backend.base, requestPath)
  if (!upstream) {
    // A probe for SSRF or traversal, or a misconfigured base: worth a record.
    console.warn(`[tlv2-proxy] ${route.name}: ${JSON.stringify(requestPath)} is outside the backend, answering 404`)
    return refuse(event, { statusCode: 404, statusMessage: 'Not Found', message: '[tlv2-proxy] Path is outside the proxy backend' })
  }

  let refusal: ProxyRefusal | undefined
  const request: ProxyRequest = {
    event,
    backend: route.name,
    path: upstream.path,
    credential: credentialOf(headers),
    headers: {},
    get refusal () {
      return refusal
    },
    refuse (first) {
      refusal ??= first
    }
  }
  await useNitroApp().hooks.callHook('tlv2proxy:request', request)

  // A hook that answered the response itself has ended the request.
  if (event.handled) {
    return
  }
  if (refusal) {
    if (!Number.isInteger(refusal.statusCode) || refusal.statusCode < 400 || refusal.statusCode > 599) {
      return hookBug(event, `refused with the status ${JSON.stringify(refusal.statusCode)}, which is not an HTTP error`)
    }
    if (traceEnabled) {
      trace('proxy — refused by a tlv2proxy:request hook:', refusal.statusCode, refusal.message)
    }
    return refuse(event, refusal)
  }
  const claimed = Object.keys(request.headers).find(name => PROXY_HEADERS.includes(name.toLowerCase()))
  if (claimed) {
    return hookBug(event, `set the header ${claimed}, which only the proxy sets`)
  }
  if (request.body !== undefined && (event.method === 'GET' || event.method === 'HEAD')) {
    return hookBug(event, `set a body on a ${event.method} request`)
  }

  // A key the caller sent goes upstream in place of the app's.
  if (request.apikey && !headers.apikey) {
    headers.apikey = request.apikey
  }
  return proxyHandler(event, { target: upstream.target, headers: { ...request.headers, ...headers }, body: request.body })
})

// Headers only the proxy sets upstream: the credentials, and the framing fetch
// computes for the body it sends.
const PROXY_HEADERS: readonly string[] = [...CREDENTIAL_HEADERS, 'content-length', 'transfer-encoding', 'host']

// Which credential the caller's own headers carry.
function credentialOf (headers: Record<string, string>): ProxyRequest['credential'] {
  if (headers.authorization) {
    return 'token'
  }
  if (headers.apikey) {
    return 'apikey'
  }
  return 'none'
}

// Answers a refusal as JSON whatever the request accepts. A proxy URL is never a
// page, and a thrown error would render Nuxt's HTML error page for a navigation,
// such as a download link.
function refuse (event: H3Event, refusal: ProxyRefusal) {
  setResponseStatus(event, refusal.statusCode, refusal.statusMessage)
  return { statusCode: refusal.statusCode, statusMessage: refusal.statusMessage, message: refusal.message }
}

// A hook that broke the proxy's contract, which is a bug: logged, reported
// through Nitro's error hooks, and answered as a JSON 500 rather than forwarded.
function hookBug (event: H3Event, what: string) {
  const error = new Error(`[tlv2-proxy] A tlv2proxy:request hook ${what}`)
  console.error(error.message)
  useNitroApp().captureError(error, { event })
  return refuse(event, { statusCode: 500, statusMessage: 'Internal Server Error', message: error.message })
}
