import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
import { defineProxyBackend } from '../proxy-registry'

// Registers each backend declared in runtimeConfig.tlv2proxy.backends at path
// `${prefix}/${name}`. Runs once at startup; backends with no base are skipped
// (declared-but-unset for env override). Consumers can still call
// defineProxyBackend() directly for dynamic backends.
export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  const prefix = config.public?.tlv2proxy?.prefix || '/proxy'
  const backends = config.tlv2proxy?.backends || {}
  for (const [name, backend] of Object.entries(backends)) {
    if (!backend?.base) {
      continue
    }
    const path = `${prefix}/${name}`
    defineProxyBackend({
      path,
      proxyBase: backend.base,
      apikey: backend.apikey,
      apikeyWithToken: backend.apikeyWithToken,
      requireToken: backend.requireToken
    })
    const flags = [`apikey: ${backend.apikey ? 'yes' : 'no'}`]
    if (backend.requireToken) { flags.push('requireToken') }
    // Never log the apikey value — only whether one was provided.
    console.log(`[tlv2-auth] proxy backend ${path} → ${backend.base} (${flags.join(', ')})`)
  }
})
