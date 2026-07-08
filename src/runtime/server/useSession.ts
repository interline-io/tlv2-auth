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

// Returns the current user's session and access token.
// loggedIn is false when auth0 is not configured or the user is anonymous.
// This is the single entry point for all server-side auth.
//
// Reads from event.context.auth0Session, which is populated by the
// auth0 server middleware (only registered when clientId is configured).
// The access token is fetched lazily to avoid calling getAccessToken()
// on routes that don't need it (e.g., auth0-nuxt's /auth/* handlers).
export async function useAuth0Session (event: H3Event): Promise<SessionContext> {
  const session = event.context.auth0Session
  if (!session) {
    if (traceEnabled) {
      trace('useAuth0Session — no auth0Session in event context, returning anonymous')
    }
    return anonymousSession()
  }

  // Dev-only auth-state simulation for exercising the degraded-session recovery
  // flow from the playground. Statically removed from production builds
  // (import.meta.dev compiles to false → dead code). Only ever DOWNGRADES a real
  // session — never fabricates a login — so it cannot grant access.
  if (import.meta.dev) {
    const sim = getCookie(event, 'tlv2_debug_auth')
    if (sim === 'anonymous') {
      return anonymousSession()
    }
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
  // getAccessToken() rejects on a degraded session (token expired, refresh
  // failed/absent). Keep loggedIn true but with no token — callers handle the
  // missing token explicitly (session.get skips apikey-only enrichment;
  // requireToken backends 401). Logged unconditionally so a non-degraded
  // failure (auth0 outage, misconfigured audience, rotated secret) is
  // diagnosable in production, not silent.
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
