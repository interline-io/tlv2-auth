import { defineNuxtPlugin, useCsrf } from '#imports'

function isSameOrigin (url: string | URL | Request): boolean {
  const target = url instanceof Request ? url.url : String(url)
  // Resolve against current origin so relative and protocol-relative URLs
  // are handled correctly, then compare normalized origins.
  try {
    const resolved = new URL(target, window.location.origin)
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') { return false }
    return resolved.origin === window.location.origin
  } catch (e) {
    console.warn('[tlv2-auth] Failed to parse URL for same-origin check:', target, e)
    return false
  }
}

// CSRF header injection for globalThis.fetch (Apollo's createUploadLink).
// nuxt-csurf already handles $fetch — this plugin only wraps native fetch
// so that Apollo and other non-ofetch callers get CSRF headers on same-origin
// requests. Custom headers on cross-origin requests trigger CORS preflights,
// which breaks external resources like map tiles.
export default defineNuxtPlugin(() => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const { csrf, headerName } = useCsrf()
    if (csrf && isSameOrigin(input)) {
      init = init || {}
      const headers = new Headers(init.headers || {})
      headers.set(headerName, csrf)
      init.headers = headers
    }
    return originalFetch(input, init)
  }
})
