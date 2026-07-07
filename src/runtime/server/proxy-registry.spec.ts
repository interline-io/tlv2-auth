import { describe, it, expect, beforeEach } from 'vitest'
import { defineProxyBackend, listProxyBackends, matchProxyBackend } from './proxy-registry'

// The registry is a globalThis-backed singleton; reset it between tests.
beforeEach(() => {
  delete (globalThis as Record<string, unknown>).__tlv2AuthProxyRegistry
})

describe('defineProxyBackend', () => {
  it('registers a backend and normalizes a trailing slash', () => {
    defineProxyBackend({ path: '/proxy/default/', proxyBase: 'https://api.example.com' })
    expect(listProxyBackends()).toEqual([
      { path: '/proxy/default', proxyBase: 'https://api.example.com' }
    ])
  })

  it('overwrites a backend registered at the same path', () => {
    defineProxyBackend({ path: '/proxy/default', proxyBase: 'https://one.example.com' })
    defineProxyBackend({ path: '/proxy/default', proxyBase: 'https://two.example.com' })
    expect(listProxyBackends()).toHaveLength(1)
    expect(listProxyBackends()[0]!.proxyBase).toBe('https://two.example.com')
  })

  it('rejects a relative path', () => {
    expect(() => defineProxyBackend({ path: 'proxy/default', proxyBase: 'https://api.example.com' }))
      .toThrow('must start with "/"')
  })

  it('rejects a non-absolute proxyBase', () => {
    expect(() => defineProxyBackend({ path: '/proxy/default', proxyBase: '/local' }))
      .toThrow('absolute http(s) proxyBase')
  })
})

describe('matchProxyBackend', () => {
  beforeEach(() => {
    defineProxyBackend({ path: '/proxy/default', proxyBase: 'https://api.example.com/api/v2', apikey: 'k' })
    defineProxyBackend({ path: '/proxy/stationEditor', proxyBase: 'https://saas.example.com', requireToken: true })
  })

  it('matches a nested path and strips the prefix', () => {
    expect(matchProxyBackend('/proxy/stationEditor/query')).toEqual({
      backend: { path: '/proxy/stationEditor', proxyBase: 'https://saas.example.com', requireToken: true },
      strippedPath: '/query'
    })
  })

  it('defaults the stripped path to "/" on an exact match', () => {
    expect(matchProxyBackend('/proxy/default')?.strippedPath).toBe('/')
  })

  it('preserves the query string', () => {
    expect(matchProxyBackend('/proxy/default/query?limit=10')?.strippedPath).toBe('/query?limit=10')
  })

  it('does not match on a prefix that is only a substring boundary', () => {
    // '/proxy/stationEditorX' must not match '/proxy/stationEditor'.
    expect(matchProxyBackend('/proxy/stationEditorX/query')).toBeNull()
  })

  it('returns null for an unregistered path', () => {
    expect(matchProxyBackend('/proxy/unknown/query')).toBeNull()
  })

  it('prefers the longest registered prefix', () => {
    defineProxyBackend({ path: '/proxy/default/admin', proxyBase: 'https://admin.example.com' })
    expect(matchProxyBackend('/proxy/default/admin/feeds')?.backend.proxyBase).toBe('https://admin.example.com')
  })
})
