import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
import { defineProxyBackend } from '../proxy-registry'
import { resolveProxyBackends } from '../../util/backends'
import { DEFAULT_PROXY_PREFIX } from '../../util/defaults'

// Registers each backend from tlv2proxy.backends (+ the legacy default) at path
// `${prefix}/${name}`. Runs once at startup; backends with no base are skipped
// (declared-but-unset for env override). Consumers can still call
// defineProxyBackend() directly for dynamic backends.
export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  const prefix = config.public?.tlv2proxy?.prefix || DEFAULT_PROXY_PREFIX
  const backends = resolveProxyBackends(config)
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
