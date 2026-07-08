import { describe, it, expect } from 'vitest'
import { resolveProxyBackends } from './backends'

describe('resolveProxyBackends', () => {
  it('returns the configured backends when there is no legacy config', () => {
    expect(resolveProxyBackends({
      tlv2proxy: { backends: { default: { base: 'https://new.example.com', apikey: 'k' } } }
    })).toEqual({ default: { base: 'https://new.example.com', apikey: 'k' } })
  })

  it('maps legacy base + apikey into a missing default backend', () => {
    expect(resolveProxyBackends({
      tlv2: { graphqlApikey: 'legacy-key', proxyBase: { default: 'https://legacy.example.com' } }
    })).toEqual({ default: { base: 'https://legacy.example.com', apikey: 'legacy-key' } })
  })

  it('maps ALL legacy proxyBase keys, not just default', () => {
    const r = resolveProxyBackends({
      tlv2: {
        graphqlApikey: 'legacy-key',
        proxyBase: {
          default: 'https://legacy.example.com',
          stationEditor: 'https://saas.example.com',
          feedManagement: 'https://fm.example.com'
        }
      }
    })
    // Legacy apikey only applies to `default`; other backends get base only.
    expect(r.default).toEqual({ base: 'https://legacy.example.com', apikey: 'legacy-key' })
    expect(r.stationEditor).toEqual({ base: 'https://saas.example.com' })
    expect(r.feedManagement).toEqual({ base: 'https://fm.example.com' })
  })

  it('does NOT re-arm a declared-but-keyless default when a legacy apikey lingers', () => {
    // A consumer that migrated to a fail-closed default (apikey omitted) must
    // not have a stale NUXT_TLV2_GRAPHQL_APIKEY folded back in.
    const r = resolveProxyBackends({
      tlv2proxy: { backends: { default: { base: 'https://new.example.com' } } },
      tlv2: { graphqlApikey: 'legacy-key', proxyBase: { default: 'https://legacy.example.com' } }
    })
    expect(r.default).toEqual({ base: 'https://new.example.com' })
    expect(r.default?.apikey).toBeUndefined()
  })

  it('leaves declared backends untouched while mapping legacy into undeclared ones', () => {
    const r = resolveProxyBackends({
      tlv2proxy: { backends: { stationEditor: { base: 'https://saas.example.com', requireToken: true } } },
      tlv2: { graphqlApikey: 'legacy-key', proxyBase: { default: 'https://legacy.example.com', stationEditor: 'https://ignored.example.com' } }
    })
    expect(r.stationEditor).toEqual({ base: 'https://saas.example.com', requireToken: true })
    expect(r.default).toEqual({ base: 'https://legacy.example.com', apikey: 'legacy-key' })
  })

  it('ignores empty legacy base values', () => {
    expect(resolveProxyBackends({
      tlv2: { graphqlApikey: 'legacy-key', proxyBase: { default: '' } }
    })).toEqual({})
  })

  it('returns empty when nothing is configured', () => {
    expect(resolveProxyBackends({})).toEqual({})
  })
})
