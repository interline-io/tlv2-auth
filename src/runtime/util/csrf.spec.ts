import { describe, it, expect } from 'vitest'
import { isSafeMethod, withCsrfCookie, CSRF_COOKIE } from './csrf'

describe('isSafeMethod', () => {
  it('treats GET/HEAD/OPTIONS as safe, case-insensitively', () => {
    expect(isSafeMethod('GET')).toBe(true)
    expect(isSafeMethod('head')).toBe(true)
    expect(isSafeMethod('OPTIONS')).toBe(true)
  })
  it('treats mutating methods as unsafe', () => {
    expect(isSafeMethod('POST')).toBe(false)
    expect(isSafeMethod('put')).toBe(false)
    expect(isSafeMethod('DELETE')).toBe(false)
  })
})

describe('withCsrfCookie', () => {
  it('appends the token to an empty cookie', () => {
    expect(withCsrfCookie('', 'abc')).toBe(`${CSRF_COOKIE}=abc`)
  })
  it('appends alongside existing cookies', () => {
    expect(withCsrfCookie('session=xyz', 'abc')).toBe(`session=xyz; ${CSRF_COOKIE}=abc`)
  })
  it('replaces an existing csrf cookie rather than duplicating it', () => {
    expect(withCsrfCookie(`session=xyz; ${CSRF_COOKIE}=old`, 'new'))
      .toBe(`session=xyz; ${CSRF_COOKIE}=new`)
  })
  it('returns the cookie unchanged when the token is empty', () => {
    expect(withCsrfCookie('session=xyz', '')).toBe('session=xyz')
  })
})
