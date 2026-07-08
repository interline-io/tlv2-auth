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
  const valid = token ? await verifyCsrfToken(token, secret) : false
  if (!valid) {
    token = undefined
    // Mint only on HTML navigations — a Set-Cookie on asset/proxy responses
    // would defeat their caching and isn't needed there.
    if ((getHeader(event, 'accept') || '').includes('text/html')) {
      token = await issueCsrfToken(secret)
      setCookie(event, CSRF_COOKIE, token, {
        httpOnly: true,
        secure: !import.meta.dev,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 365
      })
    }
  }
  event.context.tlv2Csrf = token || ''
})
