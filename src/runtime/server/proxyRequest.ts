import type { H3Event } from 'h3'

// A refusal, which the proxy answers as JSON with this status.
export interface ProxyRefusal {
  // An HTTP error status, 400 through 599.
  statusCode: number
  statusMessage?: string
  message: string
}

// The request a tlv2proxy:request hook receives, before the proxy forwards anything.
//
// A hook may set `apikey` to send the app's own key, set `body` to send in place
// of the request's own, add to `headers`, or call `refuse`. Every hook runs, and
// a later hook should leave a refused request alone; nothing can undo a refusal.
// An error a hook throws is a failure, which Nitro reports.
export interface ProxyRequest {
  readonly event: H3Event
  // The backend's name, the path segment after the proxy prefix.
  readonly backend: string
  // The path and query after the backend segment, such as '/query', exactly as
  // forwarded: dot segments resolved, with no caller-supplied apikey. Empty for
  // a bare /{prefix}/{name}, or '/' when the backend's base is a host root.
  readonly path: string
  // The caller's own credential, which the proxy sends upstream: the signed-in
  // user's token, an apikey the caller sent, or none.
  readonly credential: 'token' | 'apikey' | 'none'
  // An apikey to send upstream, such as the app's own key. The proxy sends it
  // alongside a user's token or alone, but never over a key the caller sent.
  apikey?: string
  // A body to send in place of the request's own. Not allowed on GET or HEAD.
  body?: string
  // Headers to set upstream, replacing the caller's copies of the same names.
  // Credentials and framing (content-length, transfer-encoding, host) come only
  // from the proxy, and a hook that sets one fails the request; a hook sends a
  // key through `apikey` instead.
  readonly headers: Record<string, string>
  // The first refusal a hook made, if any.
  readonly refusal?: ProxyRefusal
  // Refuses the request: the proxy answers the refusal as JSON and forwards
  // nothing. Only the first refusal counts.
  refuse (refusal: ProxyRefusal): void
}

declare module 'nitropack/types' {
  interface NitroRuntimeHooks {
    // Runs for every proxied request, after the proxy has resolved the backend
    // and the caller's credential, and before it forwards anything.
    'tlv2proxy:request': (request: ProxyRequest) => void | Promise<void>
  }
}
