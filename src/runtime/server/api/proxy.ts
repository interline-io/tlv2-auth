import { defineEventHandler, createError, getHeader } from 'h3'
import { useRuntimeConfig } from '#imports'
import { proxyHandler } from '../../util/proxy'
import { parseProxyRoute, resolveProxyBase } from '../../util/proxy-route'
import { useAuth0Session } from '../useSession'

// Proxy allows unauthenticated access by design — the server's default API key
// is injected for all requests so unauthenticated users can query backends.
// Authenticated users additionally get their JWT attached.
//
// CSRF is enforced on ALL methods (including GET) because the proxy injects
// server-side credentials (API key, JWT) — without CSRF, a cross-origin
// request could ride the user's session cookies to abuse those credentials.
export default defineEventHandler(async (event) => {
  const csrfToken = event.context.csrfToken
  const clientToken = getHeader(event, 'csrf-token')
  if (!csrfToken || csrfToken !== clientToken) {
    throw createError({
      statusCode: 403,
      message: '[tlv2-proxy] CSRF token missing or invalid'
    })
  }

  const config = useRuntimeConfig(event)

  const proxyPrefix = config.public?.tlv2?.proxyPrefix || '/proxy'
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

  return proxyHandler(
    event,
    proxyBase,
    config.tlv2?.graphqlApikey || '',
    auth.accessToken,
    strippedPath
  )
})
