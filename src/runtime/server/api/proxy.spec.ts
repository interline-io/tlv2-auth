import { describe, it, expect, vi, beforeEach, onTestFinished } from 'vitest'
import { createApp, sendRedirect, toPlainHandler, toWebHandler } from 'h3'
import { createHooks } from 'hookable'
import type { SessionContext } from '../useSession'
import type { ProxyRequest } from '../proxyRequest'

type ProxyHooks = { 'tlv2proxy:request': (request: ProxyRequest) => void | Promise<void> }

const config: { value: Record<string, any> } = { value: {} }
const session: { value: SessionContext } = { value: { loggedIn: false, user: null, accessToken: '' } }
const hooks = { value: createHooks<ProxyHooks>() }
const captured = vi.fn()

vi.mock('#imports', () => ({ useRuntimeConfig: () => config.value }))
vi.mock('nitropack/runtime', () => ({ useNitroApp: () => ({ hooks: hooks.value, captureError: captured }) }))
vi.mock('../useSession', () => ({ useAuth0Session: async () => session.value }))
vi.mock('../../util/proxy', () => ({ proxyHandler: vi.fn(async () => 'proxied') }))

const { proxyHandler } = await import('../../util/proxy')
const { default: handler } = await import('./proxy')

// Errors that escape the handler; a refusal is answered, so it never lands here.
const errors: Error[] = []
const app = createApp({ onError: (e) => { errors.push(e) } })
app.use(handler)
const fetchApp = toWebHandler(app)
// Keeps the request path as sent, where a Request would normalize its dot segments.
const plainApp = toPlainHandler(app)

// What the route asked proxyHandler to forward.
const forwarded = () => vi.mocked(proxyHandler).mock.calls[0]?.[1]

function backends (extra: Record<string, any> = {}) {
  return {
    tlv2proxy: {
      backends: {
        default: { base: 'https://api.example.com' },
        stationEditor: { base: 'https://saas.example.com' },
        rest: { base: 'https://api.example.com/api/v2/' },
        graphql: { base: 'https://api.example.com/api/v2/query' }
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
  captured.mockClear()
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

  it('proxies an anonymous caller with no credential', async () => {
    const res = await fetchApp(new Request('https://www.example.com/proxy/default/query?limit=1'))
    expect(res.status).toBe(200)
    expect(forwarded()).toEqual({ target: 'https://api.example.com/query?limit=1', headers: {}, body: undefined })
  })

  it('sends an apikey the caller supplies, by query or header, and keeps it off the path', async () => {
    await fetchApp(new Request('https://www.example.com/proxy/default/query?apikey=caller-key&limit=1'))
    expect(forwarded()?.headers).toEqual({ apikey: 'caller-key' })
    expect(forwarded()?.target).toBe('https://api.example.com/query?limit=1')
    vi.mocked(proxyHandler).mockClear()
    await fetchApp(new Request('https://www.example.com/proxy/default/query', { headers: { apikey: 'caller-key' } }))
    expect(forwarded()?.headers).toEqual({ apikey: 'caller-key' })
  })

  it('proxies a logged-in caller with their token alone, dropping an apikey they sent', async () => {
    session.value = loggedIn
    const res = await fetchApp(new Request('https://www.example.com/proxy/stationEditor/query?apikey=caller-key'))
    expect(res.status).toBe(200)
    expect(forwarded()).toEqual({ target: 'https://saas.example.com/query', headers: { authorization: 'Bearer jwt' }, body: undefined })
  })

  it('401s an anonymous caller when the app sets requireLogin', async () => {
    config.value = backends({ public: { tlv2: { requireLogin: true } } })
    const res = await fetchApp(new Request('https://www.example.com/proxy/default/query'))
    expect(res.status).toBe(401)
    expect((await res.json()).message).toContain('Authentication required')
    expect(proxyHandler).not.toHaveBeenCalled()
  })

  it('401s a degraded session', async () => {
    session.value = degraded
    const res = await fetchApp(new Request('https://www.example.com/proxy/default/query'))
    expect(res.status).toBe(401)
    expect((await res.json()).message).toContain('Session degraded')
    expect(proxyHandler).not.toHaveBeenCalled()
  })

  it('answers a refusal as JSON even to a navigation', async () => {
    config.value = backends({ public: { tlv2: { requireLogin: true } } })
    const res = await fetchApp(new Request('https://www.example.com/proxy/stationEditor/download', { headers: { accept: 'text/html' } }))
    expect(res.status).toBe(401)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.json()).toEqual({ statusCode: 401, statusMessage: 'Unauthorized', message: '[tlv2-proxy] Authentication required' })
  })

  it('honors a custom proxy prefix', async () => {
    config.value = backends({ public: { tlv2proxy: { prefix: '/api/proxy' } } })
    const res = await fetchApp(new Request('https://www.example.com/api/proxy/default/query'))
    expect(res.status).toBe(200)
    expect(proxyHandler).toHaveBeenCalledOnce()
  })
})

describe('the tlv2proxy:request hook', () => {
  it('sees the backend, the path and the caller\'s credential', async () => {
    const seen: Pick<ProxyRequest, 'backend' | 'path' | 'credential'>[] = []
    hooks.value.hook('tlv2proxy:request', ({ backend, path, credential }) => {
      seen.push({ backend, path, credential })
    })
    await fetchApp(new Request('https://www.example.com/proxy/default/query?limit=1'))
    await fetchApp(new Request('https://www.example.com/proxy/default/query?apikey=caller-key&limit=1'))
    session.value = loggedIn
    await fetchApp(new Request('https://www.example.com/proxy/stationEditor/query'))
    expect(seen).toEqual([
      { backend: 'default', path: '/query?limit=1', credential: 'none' },
      { backend: 'default', path: '/query?limit=1', credential: 'apikey' },
      { backend: 'stationEditor', path: '/query', credential: 'token' }
    ])
  })

  it('sends the apikey a hook sets alone or beside a token, but never over the caller\'s key', async () => {
    hooks.value.hook('tlv2proxy:request', (request) => {
      request.apikey = 'app-key'
    })
    await fetchApp(new Request('https://www.example.com/proxy/default/query'))
    expect(forwarded()?.headers).toEqual({ apikey: 'app-key' })
    vi.mocked(proxyHandler).mockClear()
    await fetchApp(new Request('https://www.example.com/proxy/default/query', { headers: { apikey: 'caller-key' } }))
    expect(forwarded()?.headers).toEqual({ apikey: 'caller-key' })
    vi.mocked(proxyHandler).mockClear()
    session.value = loggedIn
    await fetchApp(new Request('https://www.example.com/proxy/default/query'))
    expect(forwarded()?.headers).toEqual({ authorization: 'Bearer jwt', apikey: 'app-key' })
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
    session.value = loggedIn
    await fetchApp(new Request('https://www.example.com/proxy/default/query'))
    expect(forwarded()?.headers).toEqual({ 'x-vetted': 'signed', 'authorization': 'Bearer jwt' })
  })

  it('reports and fails a request whose hook sets a header only the proxy sets', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    onTestFinished(() => logged.mockRestore())
    for (const name of ['Authorization', 'apikey', 'Cookie', 'proxy-authorization', 'Content-Length', 'transfer-encoding', 'Host']) {
      vi.mocked(proxyHandler).mockClear()
      logged.mockClear()
      captured.mockClear()
      hooks.value = createHooks<ProxyHooks>()
      hooks.value.hook('tlv2proxy:request', (request) => {
        request.headers[name] = 'forged'
      })
      const res = await fetchApp(new Request('https://www.example.com/proxy/default/query'))
      expect(res.status, name).toBe(500)
      expect((await res.json()).message, name).toContain(`set the header ${name}, which only the proxy sets`)
      expect(String(logged.mock.calls[0]?.[0]), name).toContain(`header ${name}`)
      expect(captured, name).toHaveBeenCalledOnce()
      expect(proxyHandler, name).not.toHaveBeenCalled()
    }
  })

  it('reports and fails a request whose hook sets a body on a GET', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    onTestFinished(() => vi.mocked(console.error).mockRestore())
    hooks.value.hook('tlv2proxy:request', (request) => {
      request.body = '{"query":"{ a }"}'
    })
    const res = await fetchApp(new Request('https://www.example.com/proxy/default/query'))
    expect(res.status).toBe(500)
    expect((await res.json()).message).toContain('set a body on a GET request')
    expect(captured).toHaveBeenCalledOnce()
    expect(proxyHandler).not.toHaveBeenCalled()
  })

  it('answers a hook\'s refusal as JSON and forwards nothing, showing later hooks the refusal', async () => {
    const seen: unknown[] = []
    hooks.value.hook('tlv2proxy:request', (request) => {
      request.refuse({ statusCode: 403, statusMessage: 'Forbidden', message: 'Missing proxy token' })
    })
    hooks.value.hook('tlv2proxy:request', (request) => {
      seen.push(request.refusal?.statusCode)
    })
    const res = await fetchApp(new Request('https://www.example.com/proxy/default/query', { headers: { accept: 'text/html' } }))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ statusCode: 403, statusMessage: 'Forbidden', message: 'Missing proxy token' })
    expect(seen).toEqual([403])
    expect(proxyHandler).not.toHaveBeenCalled()
  })

  it('keeps the first refusal, which no later hook can replace', async () => {
    hooks.value.hook('tlv2proxy:request', (request) => {
      request.refuse({ statusCode: 403, statusMessage: 'Forbidden', message: 'first' })
    })
    hooks.value.hook('tlv2proxy:request', (request) => {
      request.refuse({ statusCode: 401, statusMessage: 'Unauthorized', message: 'second' })
    })
    const res = await fetchApp(new Request('https://www.example.com/proxy/default/query'))
    expect(res.status).toBe(403)
    expect((await res.json()).message).toBe('first')
    expect(proxyHandler).not.toHaveBeenCalled()
  })

  it('reports and fails a refusal whose status is not an HTTP error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    onTestFinished(() => vi.mocked(console.error).mockRestore())
    for (const statusCode of [0, 200, 302, 600, 403.5]) {
      captured.mockClear()
      hooks.value = createHooks<ProxyHooks>()
      hooks.value.hook('tlv2proxy:request', (request) => {
        request.refuse({ statusCode, message: 'no' })
      })
      const res = await fetchApp(new Request('https://www.example.com/proxy/default/query'))
      expect(res.status, String(statusCode)).toBe(500)
      expect(captured, String(statusCode)).toHaveBeenCalledOnce()
    }
    expect(proxyHandler).not.toHaveBeenCalled()
  })

  it('forwards nothing once a hook has answered the response itself', async () => {
    hooks.value.hook('tlv2proxy:request', async (request) => {
      await sendRedirect(request.event, '/login')
    })
    const res = await fetchApp(new Request('https://www.example.com/proxy/default/query'))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/login')
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

  it('does not run for a request the proxy refuses itself, so a degraded session never gets an app\'s key', async () => {
    const hook = vi.fn()
    hooks.value.hook('tlv2proxy:request', hook)
    session.value = degraded
    await fetchApp(new Request('https://www.example.com/proxy/stationEditor/query'))
    expect(hook).not.toHaveBeenCalled()
  })
})

describe('raw request paths', () => {
  it('gives a hook the path as forwarded, under a base with a trailing slash', async () => {
    const seen: string[] = []
    hooks.value.hook('tlv2proxy:request', (request) => {
      seen.push(request.path)
    })
    const res = await plainApp({ method: 'GET', path: '/proxy/rest/x/../query', headers: {} })
    expect(res.status).toBe(200)
    expect(seen).toEqual(['/query'])
    expect(forwarded()?.target).toBe('https://api.example.com/api/v2/query')
  })

  it('forwards a bare backend to its base exactly, giving a hook an empty path', async () => {
    const seen: string[] = []
    hooks.value.hook('tlv2proxy:request', (request) => {
      seen.push(request.path)
    })
    for (const path of ['/proxy/graphql', '/proxy/graphql?x=1']) {
      const res = await plainApp({ method: 'POST', path, headers: {} })
      expect(res.status, path).toBe(200)
    }
    expect(seen).toEqual(['', '?x=1'])
    expect(vi.mocked(proxyHandler).mock.calls.map(c => c[1].target)).toEqual([
      'https://api.example.com/api/v2/query',
      'https://api.example.com/api/v2/query?x=1'
    ])
  })

  it('logs and 404s a path outside the backend before any hook runs, keeping the caller\'s apikey out of the log', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    onTestFinished(() => warned.mockRestore())
    const hook = vi.fn()
    hooks.value.hook('tlv2proxy:request', hook)
    for (const path of ['/proxy/rest/../v2x/query?apikey=secret-key', '/proxy/rest/../../admin']) {
      warned.mockClear()
      const res = await plainApp({ method: 'GET', path, headers: {} })
      expect(res.status, path).toBe(404)
      expect(JSON.parse(String(res.body)).message, path).toContain('outside the proxy backend')
      expect(warned, path).toHaveBeenCalledOnce()
      expect(String(warned.mock.calls[0]?.[0]), path).not.toContain('secret-key')
    }
    expect(hook).not.toHaveBeenCalled()
    expect(proxyHandler).not.toHaveBeenCalled()
  })
})
