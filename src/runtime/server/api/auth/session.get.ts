import { defineEventHandler } from 'h3'
import { useRuntimeConfig } from '#imports'
import { enrichUserClaims } from '../../../util/enrich'
import { resolveProxyBackends } from '../../../util/backends'
import { useAuth0Session } from '../../useSession'
import { traceEnabled, trace, traceUserClaims } from '../../../util/log'

// Fetch roles from the GraphQL `me` endpoint. Returns null if the backend
// is unreachable or returns an error — enrichment is best-effort since the
// GraphQL backend is optional.
async function fetchMeData (proxyBase: string, headers: Record<string, string>) {
  // Builds its own auth headers (below), so hit the backend with native fetch.
  const response = await fetch(`${proxyBase}/query`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '{ me { id name email roles } }' })
  }).catch((e: Error) => {
    console.warn('[tlv2-auth] /auth/session: GraphQL me query network error:', e.message)
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
        `[tlv2-auth] /auth/session: GraphQL me query returned ${response.status} — check iss/aud`,
        { url: `${proxyBase}/query`, hasApikey: !!headers.apikey, jwt: jwtInfo }
      )
    }
    return null
  }
  const json = await response.json().catch((e: Error) => {
    console.warn('[tlv2-auth] /auth/session: Failed to parse GraphQL response as JSON:', e.message)
    return null
  })
  return json?.data?.me ?? null
}

// Returns the current user's session claims enriched with roles from the
// GraphQL `me` endpoint (if a backend is configured). Returns null if not
// logged in. Used by the client-side auth plugin to populate user state,
// especially when SSR is disabled (ssr: false).
export default defineEventHandler(async (event) => {
  if (traceEnabled) {
    trace('session.get — handler invoked')
  }
  const auth = await useAuth0Session(event)
  if (traceEnabled) {
    trace('session.get — loggedIn:', auth.loggedIn, 'hasUser:', !!auth.user, 'hasToken:', !!auth.accessToken)
  }
  if (!auth.loggedIn || !auth.user) {
    if (traceEnabled) {
      trace('session.get — not logged in, returning null')
    }
    return null
  }

  traceUserClaims('session.get — user claims:', auth.user)

  // Enrich with roles from the `default` backend's GraphQL `me` endpoint.
  const config = useRuntimeConfig(event)
  const identity = resolveProxyBackends(config).default
  if (!identity?.base) {
    if (traceEnabled) {
      trace('session.get — no default backend configured, returning user claims without enrichment')
    }
    return auth.user
  }

  const headers: Record<string, string> = {}
  if (auth.accessToken) {
    headers.Authorization = `Bearer ${auth.accessToken}`
  }
  if (identity.apikey) {
    headers.apikey = identity.apikey
  }

  if (traceEnabled) {
    trace('session.get — calling fetchMeData with base:', identity.base, 'hasToken:', !!auth.accessToken, 'hasApikey:', !!headers.apikey)
  }

  const meData = await fetchMeData(identity.base, headers)
  if (traceEnabled) {
    trace('session.get — fetchMeData result:', meData)
  }
  return enrichUserClaims(auth.user, meData)
})
