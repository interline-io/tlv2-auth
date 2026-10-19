import type { H3Event } from 'h3'
import { proxyRequest, sendStream, createError } from 'h3'
import { buildProxyTarget } from './proxy-route'
import { traceEnabled, trace } from './log'

// Pinned at module load (before any app plugin can wrap globalThis.fetch) so the
// proxy's outbound request always uses the real fetch and can't be re-credentialed
// downstream.
const pinnedFetch = globalThis.fetch

// Where proxyHandler sends a request, and what it sends.
export interface ProxyForward {
  // The backend's base URL.
  base: string
  // The path and query to append to `base`, with no caller-supplied apikey.
  path: string
  // The credential headers the proxy's policy chose (see buildProxyHeaders).
  headers: Record<string, string>
  // A body to send in place of the request's own.
  body?: string
}

// Forwards a request to a backend with the given credential headers, stripping
// the caller's own credentials (session cookie, caller-supplied apikey).
export async function proxyHandler (event: H3Event, forward: ProxyForward) {
  if (!forward.base) {
    throw createError({
      statusCode: 500,
      message: '[tlv2-auth] Proxy base URL is not configured for this backend.'
    })
  }

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
    // h3 forwards content-length as the request had it; fetch sets a
    // replacement body's own.
    if (forward.body !== undefined) {
      delete reqHeaders['content-length']
    }
  }
  const headers: Record<string, string> = { ...forward.headers, cookie: '' }
  const target = buildProxyTarget(forward.base, forward.path)

  if (traceEnabled) {
    trace('proxy — target:', target, 'hasToken:', !!headers.authorization, 'hasApikey:', !!headers.apikey, 'bodyReplaced:', forward.body !== undefined)
  }

  return proxyRequest(event, target, {
    fetch: pinnedFetch,
    // h3 spreads fetchOptions over the body it read, so a replacement wins.
    fetchOptions: forward.body === undefined ? { redirect: 'manual' } : { redirect: 'manual', body: forward.body },
    headers,
    onResponse: streamBody
  })
}

// Streams the upstream body to the client instead of letting h3's sendProxy copy it.
//
// sendProxy writes the body chunk by chunk into event.node.res. On the Cloudflare
// preset that is node-mock-http's ServerResponse, which Buffer.concat's every chunk
// onto everything before it: quadratic in body size, and nothing reaches the client
// until the last chunk. A 5 MB map tile took ~9 s that way, against 0.3 s upstream.
// sendStream hands the stream to the response directly (Node pipes it), and marks the
// event handled, so sendProxy returns without touching the body. It runs after
// sendProxy has copied status and headers, so those are unchanged.
function streamBody (event: H3Event, response: Response) {
  if (response.body) {
    return sendStream(event, response.body)
  }
}
