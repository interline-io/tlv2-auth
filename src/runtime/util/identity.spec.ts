import { describe, it, expect } from 'vitest'
import { resolveIdentityBackend } from './identity'

describe('resolveIdentityBackend', () => {
  it('uses the explicit identity config when set', () => {
    expect(resolveIdentityBackend({
      identityBase: 'https://id.example.com',
      identityApikey: 'id-key',
      proxyBase: { default: 'https://api.example.com' },
      graphqlApikey: 'legacy-key'
    })).toEqual({ base: 'https://id.example.com', apikey: 'id-key' })
  })

  it('falls back to the default proxy backend and graphqlApikey', () => {
    expect(resolveIdentityBackend({
      proxyBase: { default: 'https://api.example.com' },
      graphqlApikey: 'legacy-key'
    })).toEqual({ base: 'https://api.example.com', apikey: 'legacy-key' })
  })

  it('returns empty strings when nothing is configured', () => {
    expect(resolveIdentityBackend(undefined)).toEqual({ base: '', apikey: '' })
    expect(resolveIdentityBackend({})).toEqual({ base: '', apikey: '' })
  })
})
