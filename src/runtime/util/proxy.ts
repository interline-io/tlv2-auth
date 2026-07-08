import type { H3Event } from 'h3'
import { proxyRequest, getQuery, createError } from 'h3'
import { buildProxyTarget, buildProxyHeaders, stripApikeyParam } from './proxy-route'
import { traceEnabled, trace } from './log'

// Pinned at module load (before any app plugin can wrap globalThis.fetch) so the
// proxy's outbound request always uses the real fetch and can't be re-credentialed
// downstream.
const pinnedFetch = globalThis.fetch

// Forwards a request to a backend, attaching auth headers (see buildProxyHeaders)
// and stripping caller credentials (session cookie, caller-supplied apikey).
export async function proxyHandler (
  event: H3Event,
  proxyBase: string,
  backendApikey: string,
  accessToken?: string,
  pathOverride?: string,
  apikeyWithToken?: boolean
) {
  if (!proxyBase) {
    throw createError({
      statusCode: 500,
      message: '[tlv2-auth] Proxy base URL is not configured for this backend.'
    })
  }

  const query = getQuery(event)
  const requestApikey = (query.apikey ? query.apikey.toString() : '') || event.headers.get('apikey') || ''
  const headers = buildProxyHeaders(backendApikey, accessToken, requestApikey, apikeyWithToken)

  // Strip caller-supplied credentials from the incoming request so h3's
  // auto-forwarding (getProxyRequestHeaders) never copies them upstream: the
  // session cookie, any apikey, and any Authorization. Deleting at the source is
  // robust — unlike an empty-string override, it doesn't depend on h3's
  // mergeHeaders semantics. The credentials the backend sees are set explicitly
  // by buildProxyHeaders from the validated session, so a caller can't smuggle
  // an apikey (header or ?apikey=) or a Bearer token past the token-exclusive
  // policy. Node lowercases inbound header names, so one lowercase delete covers
  // every casing.
  const reqHeaders = event.node?.req?.headers
  if (reqHeaders) {
    delete reqHeaders.cookie
    delete reqHeaders.apikey
    delete reqHeaders.authorization
    delete reqHeaders['proxy-authorization']
  }
  const target = buildProxyTarget(proxyBase, stripApikeyParam(pathOverride ?? event.path))

  if (traceEnabled) {
    trace('proxy — target:', target, 'path:', pathOverride ?? event.path, 'hasToken:', !!accessToken, 'hasApikey:', !!headers.apikey)
  }

  return proxyRequest(event, target, {
    fetch: pinnedFetch,
    fetchOptions: {
      redirect: 'manual'
    },
    headers
  })
}
