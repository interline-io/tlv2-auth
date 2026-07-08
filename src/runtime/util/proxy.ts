import type { H3Event } from 'h3'
import { proxyRequest, getQuery, createError } from 'h3'
import { buildProxyTarget, buildProxyHeaders } from './proxy-route'
import { traceEnabled, trace } from './log'

// Pinned at module load (before any app plugin can wrap globalThis.fetch) so the
// proxy's outbound request always uses the real fetch and can't be re-credentialed
// downstream.
const pinnedFetch = globalThis.fetch

// Forwards a request to a backend, attaching auth headers (see buildProxyHeaders)
// and stripping the app session cookie.
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
    fetch: pinnedFetch,
    fetchOptions: {
      redirect: 'manual'
    },
    headers
  })
}
