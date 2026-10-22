import { describe, it, expect } from 'vitest'
import { parseProxyRoute, buildProxyTarget, buildProxyHeaders, stripApikeyParam } from './proxy-route'

describe('parseProxyRoute', () => {
  it('parses name and stripped path', () => {
    expect(parseProxyRoute('/proxy/stationEditor/query', '/proxy')).toEqual({ name: 'stationEditor', strippedPath: '/query' })
  })
  it('gives an empty stripped path for a bare backend', () => {
    expect(parseProxyRoute('/proxy/default', '/proxy')).toEqual({ name: 'default', strippedPath: '' })
  })
  it('preserves the query string', () => {
    expect(parseProxyRoute('/proxy/default/query?limit=10', '/proxy')).toEqual({ name: 'default', strippedPath: '/query?limit=10' })
  })
  it('preserves a query on a bare backend', () => {
    expect(parseProxyRoute('/proxy/default?x=1', '/proxy')).toEqual({ name: 'default', strippedPath: '?x=1' })
  })
  it('returns null for the bare prefix', () => {
    expect(parseProxyRoute('/proxy', '/proxy')).toBeNull()
    expect(parseProxyRoute('/proxy/', '/proxy')).toBeNull()
  })
  it('does not match a prefix that is only a substring boundary', () => {
    expect(parseProxyRoute('/proxytest/foo', '/proxy')).toBeNull()
  })
  it('supports a custom prefix', () => {
    expect(parseProxyRoute('/api/proxy/default/query', '/api/proxy')).toEqual({ name: 'default', strippedPath: '/query' })
  })
})

describe('buildProxyTarget', () => {
  it('gives the path the backend receives, dot segments resolved', () => {
    const base = 'https://api.transit.land/api/v2'
    for (const [requested, received] of [
      ['/query?limit=1', '/query?limit=1'],
      ['/x/../query', '/query'],
      ['/%2e/query', '/query'],
      ['/../v2/query', '/query'],
      ['/query/', '/query/']
    ] as const) {
      expect(buildProxyTarget(base, requested)?.path, requested).toBe(received)
    }
    expect(buildProxyTarget('https://api.example.com', '/x/../query')?.path).toBe('/query')
  })

  it('treats a base with a trailing slash like one without', () => {
    for (const requested of ['/query', '/x/../query', '/../admin', '/../v2/query', '/../../v2x/query']) {
      expect(buildProxyTarget('https://api.example.com/api/v2/', requested), requested)
        .toEqual(buildProxyTarget('https://api.example.com/api/v2', requested))
    }
    expect(buildProxyTarget('https://api.example.com/api/v2/', '/query'))
      .toEqual({ target: 'https://api.example.com/api/v2/query', path: '/query' })
    expect(buildProxyTarget('https://api.example.com/api/v2/', '/../admin')).toBeUndefined()
  })

  it('appends path to proxyBase with subpath', () => {
    expect(buildProxyTarget('https://api.transit.land/api/v2', '/query')?.target)
      .toBe('https://api.transit.land/api/v2/query')
  })

  it('appends path to proxyBase at root', () => {
    expect(buildProxyTarget('https://station-api.example.com', '/query')?.target)
      .toBe('https://station-api.example.com/query')
  })

  it('handles trailing slash on proxyBase', () => {
    expect(buildProxyTarget('https://api.example.com/', '/query')?.target)
      .toBe('https://api.example.com/query')
  })

  it('sends a bare route to the base itself, without its trailing slash or query', () => {
    for (const [base, requested, target, path] of [
      ['https://api.example.com/api/v2/query', '', 'https://api.example.com/api/v2/query', ''],
      ['https://api.example.com/api/v2/query', '?x=1', 'https://api.example.com/api/v2/query?x=1', '?x=1'],
      ['https://api.example.com/api/v2/query/', '', 'https://api.example.com/api/v2/query', ''],
      ['https://api.example.com/api/v2?fixed=1', '', 'https://api.example.com/api/v2', ''],
      ['https://api.example.com', '', 'https://api.example.com/', '/'],
      ['https://api.example.com', '?x=1', 'https://api.example.com/?x=1', '/?x=1'],
      ['https://api.example.com/?fixed=1', '', 'https://api.example.com/', '/']
    ] as const) {
      expect(buildProxyTarget(base, requested), `${base} ${requested}`).toEqual({ target, path })
    }
  })

  it('handles root path', () => {
    expect(buildProxyTarget('https://api.example.com/v2', '/')?.target)
      .toBe('https://api.example.com/v2/')
  })

  it('handles nested request paths', () => {
    expect(buildProxyTarget('https://api.example.com/v2', '/admin/feeds/123')?.target)
      .toBe('https://api.example.com/v2/admin/feeds/123')
  })

  it('handles query strings in path', () => {
    expect(buildProxyTarget('https://api.example.com/v2', '/query?limit=10')?.target)
      .toBe('https://api.example.com/v2/query?limit=10')
  })

  it('gives nothing for path traversal with ..', () => {
    expect(buildProxyTarget('https://api.example.com/api/v2', '/../../admin/users'))
      .toBeUndefined()
  })

  it('gives nothing for traversal into a sibling path that shares the base prefix', () => {
    expect(buildProxyTarget('https://api.example.com/api/v2', '/../v2x/query'))
      .toBeUndefined()
    expect(buildProxyTarget('https://api.example.com/api/v2/', '/../../v2x/query'))
      .toBeUndefined()
  })

  it('allows the base path itself', () => {
    expect(buildProxyTarget('https://api.example.com/api/v2', '/../v2')?.target)
      .toBe('https://api.example.com/api/v2')
  })

  it('gives nothing for encoded path traversal', () => {
    expect(buildProxyTarget('https://api.example.com/api/v2', '/%2e%2e/%2e%2e/admin'))
      .toBeUndefined()
  })

  it('allows normal subpaths that stay within proxyBase', () => {
    expect(buildProxyTarget('https://api.example.com/api/v2', '/feeds/../feeds/123')?.target)
      .toBe('https://api.example.com/api/v2/feeds/123')
  })

  it('gives nothing for scheme-relative SSRF (root proxyBase)', () => {
    expect(buildProxyTarget('https://api.example.com', '//attacker.com/data'))
      .toBeUndefined()
  })

  it('is safe from scheme-relative SSRF with subpath proxyBase', () => {
    // When proxyBase has a subpath, the // is treated as part of the path, not a host
    expect(buildProxyTarget('https://api.example.com/api/v2', '//attacker.com/data')?.target)
      .toBe('https://api.example.com/api/v2//attacker.com/data')
  })

  it('gives nothing for scheme-relative SSRF with port', () => {
    expect(buildProxyTarget('https://api.example.com', '//attacker.com:6379/data'))
      .toBeUndefined()
  })
})

describe('buildProxyHeaders', () => {
  it('sends the token alone, over a key the caller sent', () => {
    expect(buildProxyHeaders('jwt-token', 'caller-key')).toEqual({ authorization: 'Bearer jwt-token' })
  })

  it('sends the caller\'s key without a token', () => {
    expect(buildProxyHeaders('', 'caller-key')).toEqual({ apikey: 'caller-key' })
    expect(buildProxyHeaders(undefined, 'caller-key')).toEqual({ apikey: 'caller-key' })
  })

  it('sends nothing without either', () => {
    expect(buildProxyHeaders()).toEqual({})
    expect(buildProxyHeaders('', '')).toEqual({})
  })
})

describe('stripApikeyParam', () => {
  it('returns the path unchanged when there is no query', () => {
    expect(stripApikeyParam('/query')).toBe('/query')
  })
  it('returns the path unchanged when there is no apikey param', () => {
    expect(stripApikeyParam('/query?limit=3')).toBe('/query?limit=3')
  })
  it('drops a lone apikey param, leaving no query', () => {
    expect(stripApikeyParam('/query?apikey=secret')).toBe('/query')
  })
  it('drops apikey but keeps other params', () => {
    expect(stripApikeyParam('/query?limit=3&apikey=secret')).toBe('/query?limit=3')
  })
})
