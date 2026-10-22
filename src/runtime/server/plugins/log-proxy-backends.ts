import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
import type { ProxyBackendConfig } from '../../util/backends'
import { DEFAULT_PROXY_PREFIX } from '../../util/defaults'

// Logs the proxy backends once at server startup so a deploy can be verified
// from the logs.
export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  const prefix = config.public?.tlv2proxy?.prefix || DEFAULT_PROXY_PREFIX
  // Widened from the app's own declaration, which names only its backends.
  const backends: Record<string, ProxyBackendConfig> = config.tlv2proxy?.backends ?? {}
  const names = Object.keys(backends)
  if (!names.length) {
    console.warn('[tlv2-proxy] no backends configured — tlv2proxy.backends is empty')
    return
  }
  const summary = names.map(name => `${name} → ${backends[name]?.base || '(no base!)'}`).join(', ')
  console.log(`[tlv2-proxy] ${prefix} — ${names.length} backend(s): ${summary}`)
})
