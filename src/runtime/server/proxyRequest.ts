import type { H3Event } from 'h3'

// A refusal, which the proxy answers as JSON with this status.
export interface ProxyRefusal {
  statusCode: number
  statusMessage?: string
  message: string
}

// A request the proxy is about to send upstream, as the tlv2proxy:request hook
// sees it. A hook may set `body` to send in place of the request's own, add to
// `headers`, or set `refusal` to refuse the request. An error a hook throws is a
// failure, which Nitro reports.
export interface ProxyRequest {
  event: H3Event
  // The backend's name, the path segment after the proxy prefix.
  backend: string
  // The path and query after the backend segment, such as '/query', as the
  // backend receives it: dot segments resolved, no caller-supplied apikey.
  path: string
  // True when the request goes upstream under the backend's own apikey, the
  // shared identity an app may want to gate.
  sharedApikey: boolean
  body?: string
  // Headers to set on the request sent upstream, replacing any the caller sent
  // under the same names. The credential headers belong to the proxy, and a hook
  // that sets one fails the request.
  headers: Record<string, string>
  // Set to refuse the request: the proxy answers it as JSON and forwards nothing.
  // Every hook still runs, so a hook that finds it set should leave the request
  // alone.
  refusal?: ProxyRefusal
}

declare module 'nitropack/types' {
  interface NitroRuntimeHooks {
    // Runs for every proxied request, after the proxy applies its credential
    // policy and before it forwards anything.
    'tlv2proxy:request': (request: ProxyRequest) => void | Promise<void>
  }
}
