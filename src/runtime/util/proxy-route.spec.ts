import { describe, it, expect } from 'vitest'
import { buildProxyTarget, buildProxyHeaders } from './proxy-route'

describe('buildProxyTarget', () => {
  it('appends path to proxyBase with subpath', () => {
    expect(buildProxyTarget('https://api.transit.land/api/v2', '/query'))
      .toBe('https://api.transit.land/api/v2/query')
  })

  it('appends path to proxyBase at root', () => {
    expect(buildProxyTarget('https://station-api.example.com', '/query'))
      .toBe('https://station-api.example.com/query')
  })

  it('handles trailing slash on proxyBase', () => {
    expect(buildProxyTarget('https://api.example.com/', '/query'))
      .toBe('https://api.example.com/query')
  })

  it('handles root path', () => {
    expect(buildProxyTarget('https://api.example.com/v2', '/'))
      .toBe('https://api.example.com/v2/')
  })

  it('handles nested request paths', () => {
    expect(buildProxyTarget('https://api.example.com/v2', '/admin/feeds/123'))
      .toBe('https://api.example.com/v2/admin/feeds/123')
  })

  it('handles query strings in path', () => {
    expect(buildProxyTarget('https://api.example.com/v2', '/query?limit=10'))
      .toBe('https://api.example.com/v2/query?limit=10')
  })

  it('throws on path traversal with ..', () => {
    expect(() => buildProxyTarget('https://api.example.com/api/v2', '/../../admin/users'))
      .toThrow('[tlv2-proxy] Path traversal detected')
  })

  it('throws on encoded path traversal', () => {
    expect(() => buildProxyTarget('https://api.example.com/api/v2', '/%2e%2e/%2e%2e/admin'))
      .toThrow('[tlv2-proxy] Path traversal detected')
  })

  it('allows normal subpaths that stay within proxyBase', () => {
    expect(buildProxyTarget('https://api.example.com/api/v2', '/feeds/../feeds/123'))
      .toBe('https://api.example.com/api/v2/feeds/123')
  })

  it('throws on scheme-relative SSRF (root proxyBase)', () => {
    expect(() => buildProxyTarget('https://api.example.com', '//attacker.com/data'))
      .toThrow('[tlv2-proxy] SSRF detected')
  })

  it('is safe from scheme-relative SSRF with subpath proxyBase', () => {
    // When proxyBase has a subpath, the // is treated as part of the path, not a host
    expect(buildProxyTarget('https://api.example.com/api/v2', '//attacker.com/data'))
      .toBe('https://api.example.com/api/v2//attacker.com/data')
  })

  it('throws on scheme-relative SSRF with port', () => {
    expect(() => buildProxyTarget('https://api.example.com', '//attacker.com:6379/data'))
      .toThrow('[tlv2-proxy] SSRF detected')
  })
})

describe('buildProxyHeaders', () => {
  it('includes graphql apikey', () => {
    const headers = buildProxyHeaders('my-api-key')
    expect(headers).toEqual({ apikey: 'my-api-key' })
  })

  it('sends only the token, dropping the backend apikey, when a token is present', () => {
    const headers = buildProxyHeaders('my-api-key', 'jwt-token')
    expect(headers).toEqual({ authorization: 'Bearer jwt-token' })
  })

  it('omits authorization when accessToken is empty', () => {
    const headers = buildProxyHeaders('my-api-key', '')
    expect(headers).toEqual({ apikey: 'my-api-key' })
  })

  it('prefers requestApikey over the backend key', () => {
    const headers = buildProxyHeaders('server-key', undefined, 'user-key')
    expect(headers).toEqual({ apikey: 'user-key' })
  })

  it('falls back to the backend key when no requestApikey', () => {
    const headers = buildProxyHeaders('server-key', undefined, '')
    expect(headers).toEqual({ apikey: 'server-key' })
  })

  it('token wins over every apikey source when all are provided', () => {
    const headers = buildProxyHeaders('server-key', 'jwt-token', 'user-key')
    expect(headers).toEqual({ authorization: 'Bearer jwt-token' })
  })

  it('sends both when apikeyWithToken is set', () => {
    const headers = buildProxyHeaders('my-api-key', 'jwt-token', undefined, true)
    expect(headers).toEqual({
      apikey: 'my-api-key',
      authorization: 'Bearer jwt-token'
    })
  })

  it('omits apikey header when both keys are empty', () => {
    const headers = buildProxyHeaders('', undefined, '')
    expect(headers).toEqual({})
  })
})
