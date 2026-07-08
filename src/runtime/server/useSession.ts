import type { H3Event } from 'h3'
import { getCookie, deleteCookie } from 'h3'
import { traceEnabled, trace } from '../util/log'

export interface SessionContext {
  loggedIn: boolean
  user: Record<string, any> | null
  accessToken: string
}

function anonymousSession (): SessionContext {
  return { loggedIn: false, user: null, accessToken: '' }
}

// Returns the current user's session and lazily-fetched access token. loggedIn
// is false when auth0 is unconfigured or the user is anonymous. Reads
// event.context.auth0Session, populated by the auth0 server middleware.
export async function useAuth0Session (event: H3Event): Promise<SessionContext> {
  const session = event.context.auth0Session
  if (!session) {
    if (traceEnabled) {
      trace('useAuth0Session — no auth0Session in event context, returning anonymous')
    }
    return anonymousSession()
  }

  // Dev-only auth-state simulation for exercising degraded-session recovery from
  // the playground. Only ever DOWNGRADES a real session — never fabricates a login.
  if (import.meta.dev) {
    const sim = getCookie(event, 'tlv2_debug_auth')
    if (sim === 'degraded' || sim === 'degraded-once') {
      // 'degraded-once' self-clears so the follow-up re-auth recovers cleanly;
      // 'degraded' is sticky so the recovery-failed → logout path is observable.
      if (sim === 'degraded-once') {
        deleteCookie(event, 'tlv2_debug_auth')
      }
      return { loggedIn: true, user: session.user, accessToken: '' }
    }
  }

  if (traceEnabled) {
    trace('useAuth0Session — fetching access token for user:', session.user?.sub)
  }
  // getAccessToken() rejects on a degraded session (expired/failed refresh). Keep
  // loggedIn with an empty token — callers handle it. Warn so a non-degraded
  // failure (auth0 outage, bad audience) is diagnosable, not silent.
  let accessToken = ''
  try {
    accessToken = await session.getAccessToken()
  } catch (e) {
    console.warn('[tlv2-auth] getAccessToken failed (degraded session):', (e as Error)?.message)
  }
  if (traceEnabled) {
    trace('useAuth0Session — accessToken length:', accessToken?.length, 'empty:', !accessToken)
  }
  return {
    loggedIn: true,
    user: session.user,
    accessToken
  }
}
