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

  // Strip caller-supplied credentials so nothing rides past the injected policy:
  // delete them from the incoming request (Node lowercases header names, so one
  // lowercase delete covers all casings), and pin the session cookie empty on the
  // outgoing request. h3 applies our `headers` last in mergeHeaders and treats ''
  // as an override, so the auth0 cookie is dropped regardless of how the runtime
  // sources forwarded headers. Only cookie is pinned: authorization/apikey are
  // covered by the delete + buildProxyHeaders, and forcing them empty could make a
  // strict backend reject a present-but-empty Authorization.
  const reqHeaders = event.node?.req?.headers
  if (reqHeaders) {
    delete reqHeaders.cookie
    delete reqHeaders.apikey
    delete reqHeaders.authorization
    delete reqHeaders['proxy-authorization']
  }
  headers.cookie = ''
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
