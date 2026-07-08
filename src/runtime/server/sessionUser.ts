import type { H3Event } from 'h3'
import { enrichUserClaims } from '../util/enrich'
import { resolveProxyBackends } from '../util/backends'
import { buildProxyHeaders } from '../util/proxy-route'
import { useAuth0Session } from './useSession'
import { traceEnabled, trace, traceUserClaims } from '../util/log'

// Keep this file #imports-free: it's imported into both the nitro handler and
// the Nuxt SSR-plugin bundles, so `config` is passed in rather than resolved here.

// Cap `me` enrichment so a hung backend can't stall the SSR render or the
// /auth/session response; on timeout the query returns null (enrichment skipped).
const ENRICH_TIMEOUT_MS = 1000

// Fetch the GraphQL `me` record. Returns null on unreachable/timeout/error —
// enrichment is best-effort.
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
      const token = headers.authorization?.replace('Bearer ', '')
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

// Resolve the current user's claims, enriched with the GraphQL `me` record from
// the `default` backend. Returns null when anonymous, or the auth0 claims marked
// `tlv2_degraded` when there's no usable token.
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

  // Degraded (logged in, no token): skip enrichment and flag it — a `me` fetched
  // with only the apikey would stamp the shared key's identity onto this user.
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

  // Token-exclusive, via the same helper the proxy uses: authenticate `me` as
  // the user; only attach the shared apikey when the backend opts in with
  // apikeyWithToken, so roles never resolve under the shared key's identity.
  const headers = buildProxyHeaders(identity.apikey, auth.accessToken, undefined, identity.apikeyWithToken)

  const meData = await fetchMeData(identity.base, headers)
  if (traceEnabled) {
    trace('getSessionUser — fetchMeData result:', meData)
  }
  return enrichUserClaims(auth.user, meData)
}
