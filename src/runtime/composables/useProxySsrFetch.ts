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
  return async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const headers = new Headers(init.headers || {})
    // Carry the token issued for this render as both cookie and double-submit
    // header (the incoming request may predate issuance on a first visit), so
    // the loopback clears the same gate as browser traffic.
    headers.set('cookie', withCsrfCookie(reqCookie, csrf))
    if (csrf) headers.set(CSRF_HEADER, csrf)
    // Return a genuine Response (not ofetch's parsed FetchResponse) so data
    // clients like Apollo can call .text()/.json() on it. responseType:'text'
    // keeps the raw body; ignoreResponseError surfaces 4xx/5xx as a readable
    // response rather than a throw.
    const res = await $fetch.raw(url, {
      method: init.method as never,
      body: init.body as BodyInit | undefined,
      headers,
      responseType: 'text',
      ignoreResponseError: true
    })
    return new Response((res._data as string | undefined) ?? null, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers as unknown as HeadersInit
    })
  }
}
