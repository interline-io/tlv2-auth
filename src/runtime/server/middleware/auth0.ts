import { defineEventHandler } from 'h3'
// @ts-expect-error useAuth0 is added to #imports by @auth0/auth0-nuxt via addServerImportsDir
import { useAuth0 } from '#imports'
import { traceEnabled, trace, traceUserClaims, traceAccessToken } from '../../util/log'

// Server middleware that extracts auth0 session and attaches it to event.context.
// Provides a lazy getAccessToken so the token is only fetched when a handler needs it,
// avoiding interference with auth0-nuxt's own auth routes.
// Skips gracefully when auth0 isn't configured at runtime.
export default defineEventHandler(async (event) => {
  if (event.context.auth0Disabled) {
    return
  }
  const auth0 = useAuth0(event)
  const session = await auth0.getSession()
  if (traceEnabled) {
    trace('auth0 middleware — raw session keys:', session ? Object.keys(session) : null)
    traceUserClaims('auth0 middleware — session.user:', session?.user)
    if (session && (session as any).tokenType) {
      trace('auth0 middleware — session.tokenType:', (session as any).tokenType)
    }
  }
  if (!session?.user) {
    if (traceEnabled) {
      trace('auth0 middleware — no session user, skipping')
    }
    return
  }
  event.context.auth0Session = {
    user: session.user,
    getAccessToken: () => auth0.getAccessToken().then((t: any) => {
      const token = t.accessToken || ''
      if (traceEnabled) {
        trace('getAccessToken result keys:', t ? Object.keys(t) : null)
        if (token) {
          traceAccessToken(token)
        } else {
          trace('getAccessToken returned empty token')
        }
      }
      return token
    })
  }
})
