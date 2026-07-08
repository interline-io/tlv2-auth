import { useRequestEvent } from '#imports'
import { getRequestHeader } from 'h3'
import { CSRF_HEADER, withCsrfCookie } from '../util/csrf'

// A fetch for the SSR data client (e.g. Apollo). Loops back through the
// same-origin proxy in-process via nitro's $fetch, forwarding the request cookie
// so the proxy resolves the session and injects credentials — the same single
// path browser traffic takes. Server-only; on the client, use the ordinary
// same-origin fetch.
export function useProxySsrFetch () {
  const event = useRequestEvent()
  const reqCookie = (event && getRequestHeader(event, 'cookie')) || ''
  const csrf = (event?.context?.tlv2Csrf as string) || ''
  return (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const headers = new Headers(init.headers || {})
    // Carry the token issued for this render as both cookie and double-submit
    // header (the incoming request may predate issuance on a first visit), so
    // the loopback clears the same gate as browser traffic.
    headers.set('cookie', withCsrfCookie(reqCookie, csrf))
    if (csrf) headers.set(CSRF_HEADER, csrf)
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
