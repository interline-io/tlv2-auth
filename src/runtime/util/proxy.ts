import type { H3Event } from 'h3'
import { proxyRequest, getQuery, createError } from 'h3'
import { buildProxyTarget, buildProxyHeaders } from './proxy-route'
import { traceEnabled, trace } from './log'

// Server-side proxy that forwards requests to a backend service.
// The backend's configured apikey (if any) is injected as a fallback identity;
// an authenticated request additionally gets the user's JWT. Callers may also
// provide their own API key via ?apikey= query param or apikey header, which
// takes precedence. A backend with no apikey and no token forwards
// unauthenticated (fails closed on the upstream's terms).
export async function proxyHandler (
  event: H3Event,
  proxyBase: string,
  backendApikey: string,
  accessToken?: string,
  pathOverride?: string
) {
  if (!proxyBase) {
    throw createError({
      statusCode: 500,
      message: '[tlv2-auth] Proxy base URL is not configured for this backend. Set its proxyBase in the defineProxyBackend() registration.'
    })
  }

  const query = getQuery(event)
  const requestApikey = (query.apikey ? query.apikey.toString() : '') || event.headers.get('apikey') || ''
  const headers = buildProxyHeaders(backendApikey, accessToken, requestApikey)
  // Never forward the browser session cookie to the backend API. It's
  // irrelevant to the API, and the encrypted auth0-nuxt session cookie
  // effectively duplicates the JWT we already attach. h3's mergeHeaders treats
  // an empty string as an override (undefined would be ignored), so this
  // replaces the forwarded Cookie rather than leaving it intact.
  headers.cookie = ''
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
