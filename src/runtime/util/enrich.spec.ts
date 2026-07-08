import { describe, it, expect } from 'vitest'
import { enrichUserClaims } from './enrich'

describe('enrichUserClaims', () => {
  const baseUser = { sub: 'auth0|123', name: 'Alice', email: 'alice@example.com' }

  it('returns user unchanged when meData is null', () => {
    expect(enrichUserClaims(baseUser, null)).toEqual(baseUser)
  })

  it('attaches the full me response (incl. external_data) under tlv2_me', () => {
    const meData = {
      id: 'gql-42',
      name: 'Alice B',
      email: 'alice@work.com',
      roles: ['admin', 'editor'],
      external_data: { metering_id: 'abc', quota: '42' }
    }
    expect(enrichUserClaims(baseUser, meData)).toEqual({ ...baseUser, tlv2_me: meData })
  })

  it('preserves original user claims', () => {
    const result = enrichUserClaims(baseUser, { id: '1' })
    expect(result.sub).toBe('auth0|123')
    expect(result.name).toBe('Alice')
    expect(result.email).toBe('alice@example.com')
  })

  it('a fresh me response replaces an existing tlv2_me', () => {
    const userWithMe = { ...baseUser, tlv2_me: { id: 'old' } }
    const result = enrichUserClaims(userWithMe, { id: 'new' })
    expect(result.tlv2_me).toEqual({ id: 'new' })
  })
})
