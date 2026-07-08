import type { H3Event } from 'h3'
import { enrichUserClaims } from '../util/enrich'
import { resolveProxyBackends } from '../util/backends'
import { useAuth0Session } from './useSession'
import { traceEnabled, trace, traceUserClaims } from '../util/log'

// Cap the `me` enrichment so a slow/hung backend can't stall the SSR render (it
// runs on the render path) or the /auth/session response. On timeout the query
// returns null and enrichment is skipped; the client re-fetches to fill roles.
const ENRICH_TIMEOUT_MS = 1000

// Fetch roles from the GraphQL `me` endpoint. Returns null if the backend is
// unreachable, times out, or errors — enrichment is best-effort since the
// GraphQL backend is optional.
async function fetchMeData (proxyBase: string, headers: Record<string, string>) {
  const response = await fetch(`${proxyBase}/query`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '{ me { id name email roles external_data } }' }),
    signal: AbortSignal.timeout(ENRICH_TIMEOUT_MS)
  }).catch((e: Error) => {
    console.warn('[tlv2-auth] session enrich: GraphQL me query failed (network/timeout):', e.message)
    return null
  })
  if (!response || !response.ok) {
    if (response) {
      let jwtInfo: string | Record<string, unknown> = '(none)'
      const token = headers.Authorization?.replace('Bearer ', '')
      if (token) {
        try {
          const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString())
          jwtInfo = { iss: payload.iss, aud: payload.aud, sub: payload.sub, exp: payload.exp }
        } catch {
          jwtInfo = '(invalid JWT)'
        }
      }
      console.warn(
        `[tlv2-auth] session enrich: GraphQL me query returned ${response.status} — check iss/aud`,
        { url: `${proxyBase}/query`, hasApikey: !!headers.apikey, jwt: jwtInfo }
      )
    }
    return null
  }
  const json = await response.json().catch((e: Error) => {
    console.warn('[tlv2-auth] session enrich: failed to parse GraphQL response as JSON:', e.message)
    return null
  })
  return json?.data?.me ?? null
}

// Resolve the current user's session claims, enriched with roles from the
// `default` backend's GraphQL `me` endpoint. Returns null when not logged in,
// or the auth0 claims marked `tlv2_degraded` when the session has no usable
// token (enrichment is skipped so the shared apikey's identity is never stamped
// onto the user). Shared by the /auth/session endpoint (client fetch) and the
// SSR enrichment plugin. `config` is passed in so this file needs no #imports
// and stays valid in both the nitro-handler and Nuxt-plugin bundles.
export async function getSessionUser (
  event: H3Event,
  config: Parameters<typeof resolveProxyBackends>[0]
): Promise<Record<string, any> | null> {
  const auth = await useAuth0Session(event)
  if (traceEnabled) {
    trace('getSessionUser — loggedIn:', auth.loggedIn, 'hasUser:', !!auth.user, 'hasToken:', !!auth.accessToken)
  }
  if (!auth.loggedIn || !auth.user) {
    return null
  }
  traceUserClaims('getSessionUser — user claims:', auth.user)

  // Degraded session (logged in, no access token): skip enrichment and flag it.
  // A `me` fetched with only the apikey would resolve to the shared key's
  // identity and stamp its roles onto this user's claims. The `tlv2_degraded`
  // marker lets the client attempt a one-shot re-auth (see auth-enrich.client).
  if (!auth.accessToken) {
    return { ...auth.user, tlv2_degraded: true }
  }

  const identity = resolveProxyBackends(config).default
  if (!identity?.base) {
    if (traceEnabled) {
      trace('getSessionUser — no default backend configured, returning user claims without enrichment')
    }
    return auth.user
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.accessToken}`
  }
  if (identity.apikey) {
    headers.apikey = identity.apikey
  }

  const meData = await fetchMeData(identity.base, headers)
  if (traceEnabled) {
    trace('getSessionUser — fetchMeData result:', meData)
  }
  return enrichUserClaims(auth.user, meData)
}
