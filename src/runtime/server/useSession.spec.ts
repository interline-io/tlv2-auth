import { describe, it, expect, vi, afterEach } from 'vitest'
import type { H3Event } from 'h3'
import { useAuth0Session } from './useSession'

function eventWith (auth0Session?: Record<string, any>) {
  return { context: { auth0Session } } as unknown as H3Event
}

describe('useAuth0Session', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is anonymous when the middleware attached no session', async () => {
    expect(await useAuth0Session(eventWith())).toEqual({ loggedIn: false, user: null, accessToken: '' })
  })

  it('returns the user and their access token', async () => {
    const getAccessToken = vi.fn().mockResolvedValue('jwt')
    const res = await useAuth0Session(eventWith({ user: { sub: 'u1' }, getAccessToken }))
    expect(res).toEqual({ loggedIn: true, user: { sub: 'u1' }, accessToken: 'jwt' })
  })

  it('stays logged in with an empty token when the token fetch fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const getAccessToken = vi.fn().mockRejectedValue(new Error('refresh failed'))
    const res = await useAuth0Session(eventWith({ user: { sub: 'u1' }, getAccessToken }))
    expect(res).toEqual({ loggedIn: true, user: { sub: 'u1' }, accessToken: '' })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('getAccessToken failed'), 'refresh failed')
  })
})
