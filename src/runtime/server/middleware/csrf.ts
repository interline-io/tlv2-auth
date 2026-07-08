import { defineEventHandler, getCookie, setCookie, getHeader } from 'h3'
import { useRuntimeConfig } from '#imports'
import { CSRF_COOKIE } from '../../util/csrf'
import { csrfSecret, issueCsrfToken, verifyCsrfToken } from '../csrf'

// Issues the signed double-submit cookie on document loads and exposes the token
// on event.context (the CSRF plugin seeds it into the render payload for useCsrf).
// Issuance only — the proxy handler enforces the gate.
export default defineEventHandler(async (event) => {
  const secret = csrfSecret(useRuntimeConfig(event))
  if (!secret) return
  let token = getCookie(event, CSRF_COOKIE)
  if (!token || !(await verifyCsrfToken(token, secret))) {
    // Always mint a token for this request's server-side use (the SSR loopback
    // presents it), so anonymous renders work even for crawlers/curl that don't
    // advertise text/html. Persist it to the browser only on document loads — a
    // Set-Cookie on asset/proxy responses would defeat their caching. This is
    // context-only for non-document requests: it never reaches the client and
    // the gate reads the request's own cookie/header, so tokenless callers 403.
    token = await issueCsrfToken(secret)
    if ((getHeader(event, 'accept') || '').includes('text/html')) {
      setCookie(event, CSRF_COOKIE, token, {
        httpOnly: true,
        secure: !import.meta.dev,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 365
      })
    }
  }
  event.context.tlv2Csrf = token
})
