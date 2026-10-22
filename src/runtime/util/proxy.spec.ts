import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createApp, eventHandler, setResponseHeader, toWebHandler } from 'h3'
import type { H3Event } from 'h3'

// An upstream body whose first chunk is available at once and whose remainder
// waits until release() is called, so a test can tell streaming from buffering.
function heldStream () {
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async start (controller) {
      controller.enqueue(enc.encode('first,'))
      await held
      controller.enqueue(enc.encode('second'))
      controller.close()
    }
  })
  return { body, release }
}

// proxy.ts pins globalThis.fetch at module load, so stub it before importing.
async function makeHandler (
  upstream: Response,
  forward: { headers?: Record<string, string>, body?: string, onResponse?: (event: H3Event, response: Response) => void } = {}
) {
  const fetchMock = vi.fn().mockResolvedValue(upstream)
  vi.stubGlobal('fetch', fetchMock)
  vi.resetModules()
  const { proxyHandler } = await import('./proxy')
  const app = createApp()
  app.use(eventHandler(event => proxyHandler(event, {
    target: `https://upstream.example.com/api/v2${event.path}`,
    headers: forward.headers ?? { apikey: 'app-key' },
    body: forward.body,
    onResponse: forward.onResponse && (response => forward.onResponse!(event, response))
  })))
  return { handler: toWebHandler(app), fetchMock }
}

describe('proxyHandler', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('streams the upstream body before upstream finishes', async () => {
    const { body, release } = heldStream()
    const { handler } = await makeHandler(new Response(body, {
      headers: { 'content-type': 'application/x-protobuf' }
    }))

    // Buffering would hold this response until release(), so the await would hang.
    const res = await handler(new Request('https://www.example.com/tiles/routes/tiles/2/2/1.pbf'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/x-protobuf')

    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    const first = await reader.read()
    expect(dec.decode(first.value)).toBe('first,')

    release()
    let rest = ''
    for (let r = await reader.read(); !r.done; r = await reader.read()) {
      rest += dec.decode(r.value)
    }
    expect(rest).toBe('second')
  })

  it('passes status and headers through, minus content-encoding and content-length', async () => {
    const { handler } = await makeHandler(new Response('nope', {
      status: 404,
      headers: { 'content-encoding': 'gzip', 'content-length': '4', 'etag': '"v1"' }
    }))
    const res = await handler(new Request('https://www.example.com/missing'))
    expect(res.status).toBe(404)
    expect(res.headers.get('etag')).toBe('"v1"')
    expect(res.headers.get('content-encoding')).toBeNull()
    expect(await res.text()).toBe('nope')
  })

  it('handles an upstream response with no body', async () => {
    const { handler } = await makeHandler(new Response(null, {
      status: 304,
      headers: { etag: '"v1"' }
    }))
    const res = await handler(new Request('https://www.example.com/tiles/routes/tiles/0/0/0.pbf'))
    expect(res.status).toBe(304)
    expect(res.headers.get('etag')).toBe('"v1"')
  })

  it('sends only the credential headers it is given, stripping the caller\'s own', async () => {
    const { handler, fetchMock } = await makeHandler(new Response('ok'))
    await handler(new Request('https://www.example.com/query?limit=1', {
      headers: { cookie: 'appSession=secret', authorization: 'Bearer forged', apikey: 'caller-key' }
    }))
    const [target, init] = fetchMock.mock.calls[0]!
    // The route picks the credentials; this sends its choice.
    expect(target).toBe('https://upstream.example.com/api/v2/query?limit=1')
    const sent = new Headers(init.headers)
    expect(sent.get('apikey')).toBe('app-key')
    expect(sent.get('cookie') || '').toBe('')
    expect(sent.get('authorization')).toBeNull()

    const user = await makeHandler(new Response('ok'), { headers: { authorization: 'Bearer jwt' } })
    await user.handler(new Request('https://www.example.com/query'))
    const userSent = new Headers(user.fetchMock.mock.calls[0]![1].headers)
    expect(userSent.get('authorization')).toBe('Bearer jwt')
    expect(userSent.get('apikey')).toBeNull()
  })

  it('sends a header it is given in place of the caller\'s copy', async () => {
    const { handler, fetchMock } = await makeHandler(new Response('ok'), { headers: { 'apikey': 'app-key', 'x-vetted': 'signed' } })
    await handler(new Request('https://www.example.com/query', { headers: { 'X-Vetted': 'forged' } }))
    const sent = new Headers(fetchMock.mock.calls[0]![1].headers)
    expect(sent.get('x-vetted')).toBe('signed')
    expect(sent.get('apikey')).toBe('app-key')
  })

  it('calls onResponse with the upstream response before the body, so a header it sets reaches the client', async () => {
    const seen: number[] = []
    const { handler } = await makeHandler(new Response('missing', { status: 404 }), {
      onResponse: (event, response) => {
        seen.push(response.status)
        setResponseHeader(event, 'x-upstream-status', String(response.status))
      }
    })
    const res = await handler(new Request('https://www.example.com/tiles/routes/tiles/0/0/0.pbf'))
    expect(seen).toEqual([404])
    expect(res.status).toBe(404)
    expect(res.headers.get('x-upstream-status')).toBe('404')
    expect(await res.text()).toBe('missing')
  })

  it('sends the request\'s own body when given none to replace it', async () => {
    const { handler, fetchMock } = await makeHandler(new Response('ok'))
    await handler(new Request('https://www.example.com/query', { method: 'POST', body: '{"query":"{ original }"}' }))
    expect(String(fetchMock.mock.calls[0]![1].body)).toBe('{"query":"{ original }"}')
  })

  it('sends a replacement body, leaving fetch to set its length', async () => {
    const original = '{"query":"{ original }"}'
    const { handler, fetchMock } = await makeHandler(new Response('ok'), { body: '{"query":"{ a longer replacement }"}' })
    await handler(new Request('https://www.example.com/query', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(original.length) },
      body: original
    }))
    const init = fetchMock.mock.calls[0]![1]
    expect(init.body).toBe('{"query":"{ a longer replacement }"}')
    expect(new Headers(init.headers).get('content-length')).toBeNull()
    expect(new Headers(init.headers).get('content-type')).toBe('application/json')
  })

  it('passes a redirect through rather than following it', async () => {
    const { handler, fetchMock } = await makeHandler(new Response(null, {
      status: 302,
      headers: { location: 'https://elsewhere.example.com/' }
    }))
    const res = await handler(new Request('https://www.example.com/query'))
    expect(fetchMock.mock.calls[0]![1].redirect).toBe('manual')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://elsewhere.example.com/')
  })
})
