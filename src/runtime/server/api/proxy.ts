import { defineEventHandler, createError } from 'h3'
import { useRuntimeConfig } from '#imports'
import { proxyHandler } from '../../util/proxy'
import { parseProxyRoute, resolveProxyBase } from '../../util/proxy-route'
import { DEFAULT_PROXY_PREFIX } from '../../util/defaults'
import { useAuth0Session } from '../useSession'

// Unauthenticated requests get the server's default API key injected.
// Authenticated requests additionally get their JWT attached.
// When requireLogin is enabled, unauthenticated requests are rejected.
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)

  const proxyPrefix = config.public?.tlv2?.proxyPrefix || DEFAULT_PROXY_PREFIX
  const parsed = parseProxyRoute(event.path || '', proxyPrefix)
  if (!parsed) {
    throw createError({
      statusCode: 400,
      message: '[tlv2-proxy] Invalid proxy path'
    })
  }
  const { backendName, strippedPath } = parsed

  const proxyBases: Record<string, string> = config.tlv2?.proxyBase || {}
  const proxyBase = resolveProxyBase(backendName, proxyBases)
  if (!proxyBase) {
    throw createError({
      statusCode: 404,
      message: `[tlv2-proxy] Unknown backend: ${backendName}`
    })
  }

  const auth = await useAuth0Session(event)

  if (!auth.loggedIn && config.public?.tlv2?.requireLogin) {
    throw createError({
      statusCode: 401,
      message: '[tlv2-proxy] Authentication required'
    })
  }

  return proxyHandler(
    event,
    proxyBase,
    config.tlv2?.graphqlApikey || '',
    auth.accessToken,
    strippedPath
  )
})
