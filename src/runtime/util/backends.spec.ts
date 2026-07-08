import { describe, it, expect } from 'vitest'
import { resolveProxyBackends } from './backends'

describe('resolveProxyBackends', () => {
  it('returns the configured backends when there is no legacy config', () => {
    expect(resolveProxyBackends({
      tlv2proxy: { backends: { default: { base: 'https://new.example.com', apikey: 'k' } } }
    })).toEqual({ default: { base: 'https://new.example.com', apikey: 'k' } })
  })

  it('folds legacy base + apikey into a missing default backend', () => {
    expect(resolveProxyBackends({
      tlv2: { graphqlApikey: 'legacy-key', proxyBase: { default: 'https://legacy.example.com' } }
    })).toEqual({ default: { base: 'https://legacy.example.com', apikey: 'legacy-key' } })
  })

  it('prefers the configured default backend over legacy', () => {
    const r = resolveProxyBackends({
      tlv2proxy: { backends: { default: { base: 'https://new.example.com', apikey: 'new-key' } } },
      tlv2: { graphqlApikey: 'legacy-key', proxyBase: { default: 'https://legacy.example.com' } }
    })
    expect(r.default).toEqual({ base: 'https://new.example.com', apikey: 'new-key' })
  })

  it('leaves other backends untouched while folding legacy into default', () => {
    const r = resolveProxyBackends({
      tlv2proxy: { backends: { stationEditor: { base: 'https://saas.example.com', requireToken: true } } },
      tlv2: { graphqlApikey: 'legacy-key', proxyBase: { default: 'https://legacy.example.com' } }
    })
    expect(r.stationEditor).toEqual({ base: 'https://saas.example.com', requireToken: true })
    expect(r.default).toEqual({ base: 'https://legacy.example.com', apikey: 'legacy-key' })
  })

  it('returns empty when nothing is configured', () => {
    expect(resolveProxyBackends({})).toEqual({})
  })
})
