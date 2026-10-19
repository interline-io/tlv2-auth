import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApp, createError, toWebHandler } from 'h3'
import { createHooks } from 'hookable'
import type { SessionContext } from '../useSession'
import type { ProxyRequest } from '../proxyRequest'

type ProxyHooks = { 'tlv2proxy:request': (request: ProxyRequest) => void | Promise<void> }

const config: { value: Record<string, any> } = { value: {} }
const session: { value: SessionContext } = { value: { loggedIn: false, user: null, accessToken: '' } }
const hooks = { value: createHooks<ProxyHooks>() }

vi.mock('#imports', () => ({ useRuntimeConfig: () => config.value }))
vi.mock('nitropack/runtime', () => ({ useNitroApp: () => ({ hooks: hooks.value }) }))
vi.mock('../useSession', () => ({ useAuth0Session: async () => session.value }))
vi.mock('../../util/proxy', () => ({ proxyHandler: vi.fn(async () => 'proxied') }))

const { proxyHandler } = await import('../../util/proxy')
const { default: handler } = await import('./proxy')

// Errors that escape the handler; a refusal is answered, so it never lands here.
const errors: Error[] = []
const app = createApp({ onError: (e) => { errors.push(e) } })
app.use(handler)
const fetchApp = toWebHandler(app)

// What the route asked proxyHandler to forward.
const forwarded = () => vi.mocked(proxyHandler).mock.calls[0]?.[1]

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

beforeEach(() => {
  vi.mocked(proxyHandler).mockClear()
  errors.length = 0
  config.value = backends()
  session.value = anonymous
  hooks.value = createHooks<ProxyHooks>()
})

describe('proxy route', () => {
  it('404s an unknown backend without proxying', async () => {
    const res = await fetchApp(new Request('https://www.example.com/proxy/nope/query'))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ statusCode: 404, statusMessage: 'Not Found', message: '[tlv2-proxy] Unknown proxy backend' })
    expect(proxyHandler).not.toHaveBeenCalled()
  })

  it('proxies an anonymous caller with the shared apikey when the backend allows it', async () => {
    const res = await fetchApp(new Request('https://www.example.com/proxy/default/query?limit=1'))
    expect(res.status).toBe(200)
    expect(forwarded()).toEqual({ base: 'https://api.example.com', path: '/query?limit=1', headers: { apikey: 'shared-key' }, body: undefined })
  })

  it('prefers an apikey the caller supplies, by query or header, and keeps it off the path', async () => {
    await fetchApp(new Request('https://www.example.com/proxy/default/query?apikey=caller-key&limit=1'))
    expect(forwarded()?.headers).toEqual({ apikey: 'caller-key' })
    expect(forwarded()?.path).toBe('/query?limit=1')
    vi.mocked(proxyHandler).mockClear()
    await fetchApp(new Request('https://www.example.com/proxy/default/query', { headers: { apikey: 'caller-key' } }))
    expect(forwarded()?.headers).toEqual({ apikey: 'caller-key' })
  })

  it('401s an anonymous caller on a requireToken backend', async () => {
    const res = await fetchApp(new Request('https://www.example.com/proxy/stationEditor/query'))
    expect(res.status).toBe(401)
    expect((await res.json()).message).toContain('Authentication required')
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
    expect((await res.json()).message).toContain('Session degraded')
    expect(proxyHandler).not.toHaveBeenCalled()
  })

  it('answers a refusal as JSON even to a navigation', async () => {
    const res = await fetchApp(new Request('https://www.example.com/proxy/stationEditor/download', { headers: { accept: 'text/html' } }))
    expect(res.status).toBe(401)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.json()).toEqual({ statusCode: 401, statusMessage: 'Unauthorized', message: '[tlv2-proxy] Authentication required' })
  })

  it('proxies a logged-in caller with their token and the backend policy', async () => {
    session.value = loggedIn
    const res = await fetchApp(new Request('https://www.example.com/proxy/tiles/tiles/routes/tiles/0/0/0.pbf'))
    expect(res.status).toBe(200)
    expect(forwarded()).toEqual({
      base: 'https://api.example.com',
      path: '/tiles/routes/tiles/0/0/0.pbf',
      headers: { authorization: 'Bearer jwt', apikey: 'shared-key' },
      body: undefined
    })
  })

  it('lets a logged-in caller through to a requireToken backend', async () => {
    session.value = loggedIn
    const res = await fetchApp(new Request('https://www.example.com/proxy/stationEditor/query'))
    expect(res.status).toBe(200)
    expect(forwarded()).toEqual({ base: 'https://saas.example.com', path: '/query', headers: { authorization: 'Bearer jwt' }, body: undefined })
  })

  it('honors a custom proxy prefix', async () => {
    config.value = backends({ public: { tlv2proxy: { prefix: '/api/proxy' } } })
    const res = await fetchApp(new Request('https://www.example.com/api/proxy/default/query'))
    expect(res.status).toBe(200)
    expect(proxyHandler).toHaveBeenCalledOnce()
  })
})

describe('the tlv2proxy:request hook', () => {
  it('sees the backend, the path and whether the shared apikey rides', async () => {
    const seen: Pick<ProxyRequest, 'backend' | 'path' | 'sharedApikey'>[] = []
    hooks.value.hook('tlv2proxy:request', ({ backend, path, sharedApikey }) => {
      seen.push({ backend, path, sharedApikey })
    })
    await fetchApp(new Request('https://www.example.com/proxy/default/query?limit=1'))
    await fetchApp(new Request('https://www.example.com/proxy/default/query?apikey=caller-key&limit=1'))
    session.value = loggedIn
    await fetchApp(new Request('https://www.example.com/proxy/default/query'))
    await fetchApp(new Request('https://www.example.com/proxy/tiles/tiles/0/0/0.pbf'))
    expect(seen).toEqual([
      { backend: 'default', path: '/query?limit=1', sharedApikey: true },
      { backend: 'default', path: '/query?limit=1', sharedApikey: false },
      { backend: 'default', path: '/query', sharedApikey: false },
      { backend: 'tiles', path: '/tiles/0/0/0.pbf', sharedApikey: true }
    ])
  })

  it('forwards the body a hook sets', async () => {
    hooks.value.hook('tlv2proxy:request', (request) => {
      request.body = '{"query":"{ replaced }"}'
    })
    await fetchApp(new Request('https://www.example.com/proxy/default/query', { method: 'POST', body: '{"query":"{ original }"}' }))
    expect(forwarded()?.body).toBe('{"query":"{ replaced }"}')
  })

  it('forwards headers a hook adds beside the credential headers', async () => {
    hooks.value.hook('tlv2proxy:request', (request) => {
      request.headers['x-vetted'] = 'signed'
    })
    await fetchApp(new Request('https://www.example.com/proxy/default/query'))
    expect(forwarded()?.headers).toEqual({ 'x-vetted': 'signed', 'apikey': 'shared-key' })
  })

  it('fails a request whose hook sets a credential header, forwarding nothing', async () => {
    for (const name of ['Authorization', 'apikey', 'Cookie', 'proxy-authorization']) {
      vi.mocked(proxyHandler).mockClear()
      errors.length = 0
      hooks.value = createHooks<ProxyHooks>()
      hooks.value.hook('tlv2proxy:request', (request) => {
        request.headers[name] = 'forged'
      })
      const res = await fetchApp(new Request('https://www.example.com/proxy/default/query'))
      expect(res.status, name).toBe(500)
      expect(errors[0]?.message, name).toContain(`credential header ${name}`)
      expect(proxyHandler, name).not.toHaveBeenCalled()
    }
  })

  it('answers a hook\'s refusal as JSON, and runs no later hook and forwards nothing', async () => {
    const later = vi.fn()
    hooks.value.hook('tlv2proxy:request', () => {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Missing proxy token' })
    })
    hooks.value.hook('tlv2proxy:request', later)
    const res = await fetchApp(new Request('https://www.example.com/proxy/default/query', { headers: { accept: 'text/html' } }))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ statusCode: 403, statusMessage: 'Forbidden', message: 'Missing proxy token' })
    expect(later).not.toHaveBeenCalled()
    expect(proxyHandler).not.toHaveBeenCalled()
  })

  it('passes a hook\'s failure through as an error', async () => {
    hooks.value.hook('tlv2proxy:request', () => {
      throw new Error('hook broke')
    })
    const res = await fetchApp(new Request('https://www.example.com/proxy/default/query'))
    expect(res.status).toBe(500)
    expect(errors[0]?.message).toContain('hook broke')
    expect(proxyHandler).not.toHaveBeenCalled()
  })

  it('does not run for a request the proxy refuses itself', async () => {
    const hook = vi.fn()
    hooks.value.hook('tlv2proxy:request', hook)
    await fetchApp(new Request('https://www.example.com/proxy/stationEditor/query'))
    expect(hook).not.toHaveBeenCalled()
  })
})
