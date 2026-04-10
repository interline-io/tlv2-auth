import { defineEventHandler } from 'h3'
// @ts-expect-error useAuth0 is added to #imports by @auth0/auth0-nuxt via addServerImportsDir
import { useAuth0 } from '#imports'
import { traceEnabled, trace } from '../../util/log'

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
    trace('auth0 middleware — session.user:', JSON.stringify(session?.user, null, 2))
    if (session && (session as any).idToken) {
      trace('auth0 middleware — session.idToken:', (session as any).idToken)
    }
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
        trace('getAccessToken full result:', JSON.stringify(t, null, 2))
        if (token) {
          const parts = token.split('.')
          trace('accessToken part count:', parts.length, '(3=JWS, 5=JWE)')
          trace('accessToken full value:', token)
          if (parts.length >= 2) {
            try {
              const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
              trace('accessToken header (decoded):', JSON.stringify(header, null, 2))
            } catch (e: any) {
              trace('accessToken header decode FAILED:', e.message)
              trace('accessToken header raw base64url:', parts[0])
            }
            try {
              const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
              trace('accessToken payload (decoded):', JSON.stringify(payload, null, 2))
            } catch (e: any) {
              trace('accessToken payload decode FAILED (likely encrypted/JWE):', e.message)
              trace('accessToken payload raw base64url:', parts[1])
            }
          }
        } else {
          trace('getAccessToken returned empty token')
        }
      }
      return token
    })
  }
})
