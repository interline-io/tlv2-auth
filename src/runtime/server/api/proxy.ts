import { defineEventHandler, createError } from 'h3'
import { useRuntimeConfig } from '#imports'
import { proxyHandler } from '../../util/proxy'
import { parseProxyRoute } from '../../util/proxy-route'
import { resolveProxyBackends } from '../../util/backends'
import { DEFAULT_PROXY_PREFIX } from '../../util/defaults'
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

  const auth = await useAuth0Session(event)

  // Fail closed without a usable token so a request never silently borrows the
  // shared apikey identity:
  //   - requireToken backend: token mandatory (anonymous or degraded → 401).
  //   - degraded session (logged in, but token expired / refresh failed): a known
  //     user must re-authenticate rather than downgrade to the anonymous apikey.
  // Genuinely anonymous callers (never logged in) still get the apikey fallback
  // where a backend allows it.
  if (!auth.accessToken && (backend.requireToken || auth.loggedIn)) {
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
