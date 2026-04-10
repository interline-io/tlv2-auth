import type { H3Event } from 'h3'
import { proxyRequest, getQuery, createError } from 'h3'
import { buildProxyTarget, buildProxyHeaders } from './proxy-route'
import { traceEnabled, trace } from './log'

// Server-side proxy that forwards requests to backend services.
// Unauthenticated requests get the server's default API key;
// authenticated requests additionally get the user's JWT.
// Callers may also provide their own API key via ?apikey= query
// param or apikey header, which takes precedence over the default.
export async function proxyHandler (
  event: H3Event,
  proxyBase: string,
  graphqlApikey: string,
  accessToken?: string,
  pathOverride?: string
) {
  if (!proxyBase) {
    throw createError({
      statusCode: 500,
      message: '[tlv2-auth] Proxy base URL is not configured. Set the NUXT_TLV2_PROXY_BASE_DEFAULT (or client-specific) environment variable, or configure runtimeConfig.tlv2.proxyBase in nuxt.config.ts.'
    })
  }

  const query = getQuery(event)
  const requestApikey = (query.apikey ? query.apikey.toString() : '') || event.headers.get('apikey') || ''
  const headers = buildProxyHeaders(graphqlApikey, accessToken, requestApikey)
  const target = buildProxyTarget(proxyBase, pathOverride ?? event.path)

  if (traceEnabled) {
    trace('proxy — target:', target, 'path:', pathOverride ?? event.path, 'hasToken:', !!accessToken, 'hasApikey:', !!headers.apikey)
  }

  return proxyRequest(event, target, {
    fetchOptions: {
      redirect: 'manual'
    },
    headers
  })
}
