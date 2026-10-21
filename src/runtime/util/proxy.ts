import type { H3Event } from 'h3'
import { proxyRequest, sendStream } from 'h3'
import { CREDENTIAL_HEADERS } from './proxy-route'
import { traceEnabled, trace } from './log'

// Pinned at module load (before any app plugin can wrap globalThis.fetch) so the
// proxy's outbound request always uses the real fetch and can't be re-credentialed
// downstream.
const pinnedFetch = globalThis.fetch

// Where proxyHandler sends a request, and what it sends.
export interface ProxyForward {
  // The upstream URL (see buildProxyTarget).
  target: string
  // The headers to set upstream: the credential headers the proxy's policy chose
  // (see buildProxyHeaders), and any a tlv2proxy:request hook added.
  headers: Record<string, string>
  // A body to send in place of the request's own.
  body?: string
}

// Forwards a request to a backend with the given headers, stripping the caller's
// own credentials (session cookie, caller-supplied apikey).
export async function proxyHandler (event: H3Event, forward: ProxyForward) {
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
    for (const name of CREDENTIAL_HEADERS) {
      Reflect.deleteProperty(reqHeaders, name)
    }
    // h3 forwards the request's own content-length; fetch sets the length of
    // a replacement body.
    if (forward.body !== undefined) {
      delete reqHeaders['content-length']
    }
  }
  const headers: Record<string, string> = { ...forward.headers, cookie: '' }
  const target = forward.target

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
