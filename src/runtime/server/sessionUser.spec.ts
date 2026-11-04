import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { H3Event } from 'h3'
import type * as SessionUser from './sessionUser'

// Re-imported per test: the module keeps a once-per-instance warning flag.
let getSessionUser: typeof SessionUser.getSessionUser

function eventWith (auth0Session?: Record<string, any>) {
  return { context: { auth0Session } } as unknown as H3Event
}

function withToken (token: string | Error) {
  const getAccessToken = token instanceof Error ? vi.fn().mockRejectedValue(token) : vi.fn().mockResolvedValue(token)
  return eventWith({ user: { sub: 'u1', email: 'a@example.com' }, getAccessToken })
}

const me = { id: 7, name: 'A', email: 'a@example.com', roles: ['tl_user'], external_data: {} }

function config () {
  return { tlv2proxy: { backends: { default: { base: 'https://api.example.com' } } } }
}

describe('getSessionUser', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(async () => {
    vi.resetModules()
    getSessionUser = (await import('./sessionUser')).getSessionUser
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

  it('flags a degraded session and never queries me', async () => {
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
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('falls back to plain claims when me fails', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 401 }))
    expect(await getSessionUser(withToken('jwt'), config())).toEqual({ sub: 'u1', email: 'a@example.com' })

    fetchMock.mockRejectedValue(new Error('timeout'))
    expect(await getSessionUser(withToken('jwt'), config())).toEqual({ sub: 'u1', email: 'a@example.com' })
  })

  it.each([
    ['absent', {}],
    ['declared with an empty base', { tlv2proxy: { backends: { default: { base: '' } } } }],
  ])('returns plain claims and warns once when the default backend is %s', async (_, noBase) => {
    expect(await getSessionUser(withToken('jwt'), noBase)).toEqual({ sub: 'u1', email: 'a@example.com' })
    expect(await getSessionUser(withToken('jwt'), noBase)).toEqual({ sub: 'u1', email: 'a@example.com' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledTimes(1)
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('NUXT_TLV2PROXY_BACKENDS_DEFAULT_BASE'))
  })
})
