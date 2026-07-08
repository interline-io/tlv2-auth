import { defineEventHandler, getQuery, sendRedirect } from 'h3'
import { useRuntimeConfig } from '#imports'
import { DEFAULT_AUTH_PREFIX } from '../../util/defaults'

// auth0 redirects back to the callback with `?error=...` when a login is
// declined or can't complete (access_denied, login_required, …). auth0-nuxt's
// stock callback handler doesn't check for it and throws while trying to
// exchange a missing authorization code. Intercept that here and redirect home
// so a declined/failed login lands cleanly; the client then applies its own
// logged-out/degraded handling (see auth-enrich.client).
export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const authPrefix = config.public?.tlv2?.authPrefix || DEFAULT_AUTH_PREFIX
  if ((event.path || '').split('?')[0] !== `${authPrefix}/callback`) {
    return
  }
  const query = getQuery(event)
  if (query.error) {
    const desc = query.error_description
    console.warn(`[tlv2-auth] login callback returned "${query.error}"${desc ? `: ${desc}` : ''} — redirecting home`)
    return sendRedirect(event, '/')
  }
})
