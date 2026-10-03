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

function config (apikeyWithToken?: boolean) {
  return { tlv2proxy: { backends: { default: { base: 'https://api.example.com', apikey: 'shared-key', apikeyWithToken } } } }
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

  it('enriches claims with me, fetched with the user token only', async () => {
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
    expect(init.headers.apikey).toBe('shared-key')
  })

  it('falls back to plain claims when me fails', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 401 }))
    expect(await getSessionUser(withToken('jwt'), config())).toEqual({ sub: 'u1', email: 'a@example.com' })

    fetchMock.mockRejectedValue(new Error('timeout'))
    expect(await getSessionUser(withToken('jwt'), config())).toEqual({ sub: 'u1', email: 'a@example.com' })
  })

  it('returns plain claims when no default backend is configured', async () => {
    expect(await getSessionUser(withToken('jwt'), {})).toEqual({ sub: 'u1', email: 'a@example.com' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
