import { useRequestEvent } from '#imports'
import { getRequestHeader } from 'h3'

// A fetch for SSR data clients that need the fetch/Response contract (e.g.
// Apollo links). Loops back through the same-origin proxy in-process,
// forwarding the request cookie so the proxy resolves the session.
// Server-only; on the client, use the ordinary same-origin fetch.
export function useProxySsrFetch () {
  const event = useRequestEvent()
  const cookie = (event && getRequestHeader(event, 'cookie')) || ''
  return async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const headers = new Headers(init.headers || {})
    // Forward the session cookie only to the in-process loopback (a relative
    // proxy path). Never attach it to an absolute or protocol-relative URL,
    // which would leak the auth0 session cookie to another origin.
    if (cookie && url.startsWith('/') && !url.startsWith('//')) {
      headers.set('cookie', cookie)
    }
    // Return a real Response (not ofetch's parsed FetchResponse) so Apollo can
    // call .text()/.json(); responseType:'text' + ignoreResponseError keep raw
    // 4xx/5xx bodies.
    const res = await $fetch.raw(url, {
      method: init.method as never,
      body: init.body as BodyInit | undefined,
      headers,
      responseType: 'text',
      ignoreResponseError: true
    })
    // 101/204/205/304 must have a null body — the Response constructor throws
    // otherwise, and responseType:'text' yields '' (not nullish) for an empty body.
    const nullBody = [101, 204, 205, 304].includes(res.status)
    return new Response(nullBody ? null : ((res._data as string | undefined) ?? null), {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers as unknown as HeadersInit
    })
  }
}
