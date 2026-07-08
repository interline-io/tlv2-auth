import { defineEventHandler, getQuery, sendRedirect } from 'h3'
import { useRuntimeConfig } from '#imports'
import { DEFAULT_AUTH_PREFIX } from '../../util/defaults'

// auth0 appends `?error=...` on a declined/failed login; auth0-nuxt's callback
// handler doesn't check for it and throws exchanging a missing code. Redirect
// home instead so a declined login lands cleanly.
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
