import { useRequestEvent } from '#imports'
import { getRequestHeader } from 'h3'

// A fetch for the SSR data client (e.g. Apollo). Loops back through the
// same-origin proxy in-process via nitro's $fetch, forwarding the request cookie
// so the proxy resolves the session and injects credentials — the same single
// path browser traffic takes. Server-only; on the client, use the ordinary
// same-origin fetch.
export function useProxySsrFetch () {
  const event = useRequestEvent()
  const cookie = (event && getRequestHeader(event, 'cookie')) || ''
  return (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const headers = new Headers(init.headers || {})
    headers.set('cookie', cookie)
    // $fetch.raw returns a Response-compatible object; ignoreResponseError so a
    // 401/404 comes back as a response the caller can read, not a throw.
    return $fetch.raw(url, {
      method: init.method as never,
      body: init.body as BodyInit | undefined,
      headers,
      ignoreResponseError: true
    }) as unknown as Promise<Response>
  }
}
