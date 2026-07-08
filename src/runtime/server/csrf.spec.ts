import { describe, it, expect } from 'vitest'
import { issueCsrfToken, verifyCsrfToken, csrfDoubleSubmitOk, csrfSecret } from './csrf'

const SECRET = 'test-secret-value'

describe('csrfSecret', () => {
  it('reads the auth0 session secret', () => {
    expect(csrfSecret({ auth0: { sessionSecret: 's' } })).toBe('s')
    expect(csrfSecret({})).toBe('')
  })
})

describe('issue/verify', () => {
  it('verifies a token it issued', async () => {
    const token = await issueCsrfToken(SECRET)
    expect(await verifyCsrfToken(token, SECRET)).toBe(true)
  })
  it('rejects a token under a different secret', async () => {
    const token = await issueCsrfToken(SECRET)
    expect(await verifyCsrfToken(token, 'other-secret')).toBe(false)
  })
  it('rejects a tampered signature', async () => {
    const token = await issueCsrfToken(SECRET)
    const tampered = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A')
    expect(await verifyCsrfToken(tampered, SECRET)).toBe(false)
  })
  it('rejects empty/malformed tokens', async () => {
    expect(await verifyCsrfToken('', SECRET)).toBe(false)
    expect(await verifyCsrfToken(undefined, SECRET)).toBe(false)
    expect(await verifyCsrfToken('no-dot', SECRET)).toBe(false)
    expect(await verifyCsrfToken('.sig', SECRET)).toBe(false)
  })
})

describe('csrfDoubleSubmitOk', () => {
  it('passes when cookie and header match and are validly signed', async () => {
    const token = await issueCsrfToken(SECRET)
    expect(await csrfDoubleSubmitOk(token, token, SECRET)).toBe(true)
  })
  it('fails when cookie and header differ', async () => {
    const a = await issueCsrfToken(SECRET)
    const b = await issueCsrfToken(SECRET)
    expect(await csrfDoubleSubmitOk(a, b, SECRET)).toBe(false)
  })
  it('fails when either side is missing', async () => {
    const token = await issueCsrfToken(SECRET)
    expect(await csrfDoubleSubmitOk(token, undefined, SECRET)).toBe(false)
    expect(await csrfDoubleSubmitOk(undefined, token, SECRET)).toBe(false)
  })
  it('fails when the matched token is not validly signed', async () => {
    expect(await csrfDoubleSubmitOk('forged.sig', 'forged.sig', SECRET)).toBe(false)
  })
})
