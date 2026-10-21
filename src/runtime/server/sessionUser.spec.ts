import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { H3Event } from 'h3'
import { getSessionUser } from './sessionUser'

function eventWith (auth0Session?: Record<string, any>) {
  return { context: { auth0Session } } as unknown as H3Event
}

function withToken (token: string | Error) {
  const getAccessToken = token instanceof Error ? vi.fn().mockRejectedValue(token) : vi.fn().mockResolvedValue(token)
  return eventWith({ user: { sub: 'u1', email: 'a@example.com' }, getAccessToken })
}

const me = { id: 7, name: 'A', email: 'a@example.com', roles: ['tl_user'], external_data: {} }

// The module's defaults, `default` plus `/query`, with a second backend whose
// base is the GraphQL endpoint. Each backend has its own apikey, so a test can
// tell which one went upstream.
function config (apikeyWithToken?: boolean, me: { meBackend?: string, mePath?: string } = { meBackend: 'default', mePath: '/query' }) {
  return {
    tlv2proxy: {
      ...me,
      backends: {
        default: { base: 'https://api.example.com', apikey: 'default-key', apikeyWithToken },
        graphql: { base: 'https://graphql.example.com/v2/query', apikey: 'graphql-key', apikeyWithToken }
      }
    }
  }
}

describe('getSessionUser', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { me } }))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns null for an anonymous caller', async () => {
    expect(await getSessionUser(eventWith(), config())).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('flags a degraded session and never queries me under the shared apikey', async () => {
    const user = await getSessionUser(withToken(new Error('refresh failed')), config())
    expect(user).toEqual({ sub: 'u1', email: 'a@example.com', tlv2_degraded: true })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('enriches claims with me, fetched from the default backend plus /query with the user token only', async () => {
    const user = await getSessionUser(withToken('jwt'), config())
    expect(user).toEqual({ sub: 'u1', email: 'a@example.com', tlv2_me: me })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.example.com/query')
    expect(init.headers.authorization).toBe('Bearer jwt')
    expect(init.headers.apikey).toBeUndefined()
  })

  it('sends the apikey alongside the token when the backend opts in', async () => {
    await getSessionUser(withToken('jwt'), config(true))
    const [, init] = fetchMock.mock.calls[0]!
    expect(init.headers.authorization).toBe('Bearer jwt')
    expect(init.headers.apikey).toBe('default-key')
  })

  it('fetches me from the backend meBackend names, at its base plus mePath, under that backend\'s apikey', async () => {
    await getSessionUser(withToken('jwt'), config(true, { meBackend: 'graphql', mePath: '' }))
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://graphql.example.com/v2/query')
    expect(init.headers.apikey).toBe('graphql-key')
  })

  it('falls back to plain claims when me fails', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 401 }))
    expect(await getSessionUser(withToken('jwt'), config())).toEqual({ sub: 'u1', email: 'a@example.com' })

    fetchMock.mockRejectedValue(new Error('timeout'))
    expect(await getSessionUser(withToken('jwt'), config())).toEqual({ sub: 'u1', email: 'a@example.com' })
  })

  it('returns plain claims when the me backend is missing or has no base', async () => {
    expect(await getSessionUser(withToken('jwt'), {})).toEqual({ sub: 'u1', email: 'a@example.com' })
    expect(await getSessionUser(withToken('jwt'), config(false, { meBackend: 'missing', mePath: '/query' }))).toEqual({ sub: 'u1', email: 'a@example.com' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
