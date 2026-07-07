import type { Plugin } from '#app'
import { defineNuxtPlugin, useRuntimeConfig } from '#imports'
import { useAuth0Session } from '../server/useSession'
import { traceEnabled, trace } from '../util/log'

// Server-side auth header injection for SSR requests.
// Overrides globalThis.$fetch and globalThis.fetch to inject the user's JWT
// and API key so that SSR data fetching has the same auth context as the
// original request. This covers both ofetch ($fetch/useFetch) and native
// fetch (used by Apollo's createUploadLink).
//
// Injection targets only the identity backend origin — the one backend the SSR
// path fetches (privileged backends are client-rendered). This deliberately
// does NOT inject the identity apikey toward other backend origins, so a
// strict backend can't be handed a shared fallback identity during SSR.
const plugin: Plugin = defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  const identityApikey = config.tlv2?.identityApikey || config.tlv2?.graphqlApikey || ''
  const identityBase = config.tlv2?.identityBase || config.tlv2?.proxyBase?.default || ''

  const identityOrigin = (identityBase.startsWith('http://') || identityBase.startsWith('https://'))
    ? new URL(identityBase).origin
    : ''

  function isBackendRequest (url: string): boolean {
    if (!identityOrigin) { return false }
    if (!url.startsWith('http://') && !url.startsWith('https://')) { return false }
    return new URL(url).origin === identityOrigin
  }

  async function getAuthHeaders (): Promise<Record<string, string>> {
    const headers: Record<string, string> = {}
    if (identityApikey) {
      headers.apikey = identityApikey
    }
    const event = nuxtApp.ssrContext?.event
    if (event) {
      const auth = await useAuth0Session(event)
      if (traceEnabled) {
        trace('auth.server getAuthHeaders — loggedIn:', auth.loggedIn, 'hasToken:', !!auth.accessToken)
      }
      if (auth.accessToken) {
        headers.Authorization = `Bearer ${auth.accessToken}`
      }
    }
    return headers
  }

  // Override $fetch (ofetch) — covers useFetch, $fetch, fetchAdmin, etc.
  globalThis.$fetch = globalThis.$fetch.create({
    async onRequest ({ request, options }) {
      const rawUrl = typeof request === 'string' ? request : (request as Request).url || ''
      let effectiveUrl = rawUrl
      if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
        const base = typeof (options as any).baseURL === 'string' ? (options as any).baseURL : ''
        if (base && (base.startsWith('http://') || base.startsWith('https://'))) {
          try {
            effectiveUrl = new URL(rawUrl, base).toString()
          } catch (e) {
            console.warn('[tlv2-auth] Failed to resolve URL:', rawUrl, base, e)
          }
        }
      }
      if (!isBackendRequest(effectiveUrl)) { return }
      const authHeaders = await getAuthHeaders()
      const headers = new Headers(options.headers || {})
      // set() not append(): a request may already carry Authorization/apikey
      // (e.g. the server-side proxy pre-authenticates its outbound request).
      // append() would comma-join into "Bearer <tok>, Bearer <tok>", which the
      // backend parses as a malformed JWT and rejects with 401.
      for (const [key, value] of Object.entries(authHeaders)) {
        headers.set(key, value)
      }
      options.headers = headers
    }
  })

  // Wrap globalThis.fetch — covers Apollo's createUploadLink
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    if (!isBackendRequest(url)) {
      return originalFetch(input, init)
    }
    const authHeaders = await getAuthHeaders()
    init = init || {}
    const headers = new Headers(init.headers || {})
    // set() not append(): the request may already carry Authorization/apikey
    // (the server-side proxy pre-authenticates its outbound request, which
    // flows through this override). append() would comma-join into
    // "Bearer <tok>, Bearer <tok>", which the backend rejects as a malformed JWT.
    for (const [key, value] of Object.entries(authHeaders)) {
      headers.set(key, value)
    }
    init.headers = headers
    return originalFetch(input, init)
  }
})
export default plugin
