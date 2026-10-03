import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApp, toWebHandler } from 'h3'
import type { SessionContext } from '../useSession'

const config: { value: Record<string, any> } = { value: {} }
const session: { value: SessionContext } = { value: { loggedIn: false, user: null, accessToken: '' } }

vi.mock('#imports', () => ({ useRuntimeConfig: () => config.value }))
vi.mock('../useSession', () => ({ useAuth0Session: async () => session.value }))
vi.mock('../../util/proxy', () => ({ proxyHandler: vi.fn(async () => 'proxied') }))

const { proxyHandler } = await import('../../util/proxy')
const { default: handler } = await import('./proxy')

// Bare h3 leaves an error's message out of the response body (Nitro's handler
// includes it), so capture the thrown error to check which 401 was raised.
const errors: Error[] = []
const app = createApp({ onError: (e) => { errors.push(e) } })
app.use(handler)
const fetchApp = toWebHandler(app)

function backends (extra: Record<string, any> = {}) {
  return {
    tlv2proxy: {
      backends: {
        default: { base: 'https://api.example.com', apikey: 'shared-key' },
        tiles: { base: 'https://api.example.com', apikey: 'shared-key', apikeyWithToken: true },
        stationEditor: { base: 'https://saas.example.com', requireToken: true }
      }
    },
    ...extra
  }
}

const anonymous: SessionContext = { loggedIn: false, user: null, accessToken: '' }
const loggedIn: SessionContext = { loggedIn: true, user: { sub: 'u1' }, accessToken: 'jwt' }
const degraded: SessionContext = { loggedIn: true, user: { sub: 'u1' }, accessToken: '' }

describe('proxy route', () => {
  beforeEach(() => {
    vi.mocked(proxyHandler).mockClear()
    errors.length = 0
    config.value = backends()
    session.value = anonymous
  })

  it('404s an unknown backend without proxying', async () => {
    const res = await fetchApp(new Request('https://www.example.com/proxy/nope/query'))
    expect(res.status).toBe(404)
    expect(proxyHandler).not.toHaveBeenCalled()
  })

  it('proxies an anonymous caller with the shared apikey when the backend allows it', async () => {
    const res = await fetchApp(new Request('https://www.example.com/proxy/default/query?limit=1'))
    expect(res.status).toBe(200)
    expect(proxyHandler).toHaveBeenCalledWith(
      expect.anything(), 'https://api.example.com', 'shared-key', '', '/query?limit=1', undefined
    )
  })

  it('401s an anonymous caller on a requireToken backend', async () => {
    const res = await fetchApp(new Request('https://www.example.com/proxy/stationEditor/query'))
    expect(res.status).toBe(401)
    expect(errors[0]?.message).toContain('Authentication required')
    expect(proxyHandler).not.toHaveBeenCalled()
  })

  it('401s an anonymous caller when the app sets requireLogin', async () => {
    config.value = backends({ public: { tlv2: { requireLogin: true } } })
    const res = await fetchApp(new Request('https://www.example.com/proxy/default/query'))
    expect(res.status).toBe(401)
    expect(proxyHandler).not.toHaveBeenCalled()
  })

  it('401s a degraded session rather than falling back to the shared apikey', async () => {
    session.value = degraded
    const res = await fetchApp(new Request('https://www.example.com/proxy/default/query'))
    expect(res.status).toBe(401)
    expect(errors[0]?.message).toContain('Session degraded')
    expect(proxyHandler).not.toHaveBeenCalled()
  })

  it('proxies a logged-in caller with their token and the backend policy', async () => {
    session.value = loggedIn
    const res = await fetchApp(new Request('https://www.example.com/proxy/tiles/tiles/routes/tiles/0/0/0.pbf'))
    expect(res.status).toBe(200)
    expect(proxyHandler).toHaveBeenCalledWith(
      expect.anything(), 'https://api.example.com', 'shared-key', 'jwt', '/tiles/routes/tiles/0/0/0.pbf', true
    )
  })

  it('lets a logged-in caller through to a requireToken backend', async () => {
    session.value = loggedIn
    const res = await fetchApp(new Request('https://www.example.com/proxy/stationEditor/query'))
    expect(res.status).toBe(200)
    expect(proxyHandler).toHaveBeenCalledWith(
      expect.anything(), 'https://saas.example.com', '', 'jwt', '/query', undefined
    )
  })

  it('honors a custom proxy prefix', async () => {
    config.value = backends({ public: { tlv2proxy: { prefix: '/api/proxy' } } })
    const res = await fetchApp(new Request('https://www.example.com/api/proxy/default/query'))
    expect(res.status).toBe(200)
    expect(proxyHandler).toHaveBeenCalledOnce()
  })
})
