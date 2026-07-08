import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
import { resolveProxyBackends } from '../../util/backends'
import { DEFAULT_PROXY_PREFIX } from '../../util/defaults'

// Logs the resolved proxy backends once at server startup so a deploy can be
// verified from the logs. Prints each backend's base and policy flags, never
// the apikey value.
export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  const prefix = config.public?.tlv2proxy?.prefix || DEFAULT_PROXY_PREFIX
  const backends = resolveProxyBackends(config)
  const names = Object.keys(backends)
  if (!names.length) {
    console.warn('[tlv2-proxy] no backends configured — tlv2proxy.backends is empty')
    return
  }
  const summary = names.map((name) => {
    const b = backends[name]
    const flags = [
      b?.apikey ? 'apikey' : null,
      b?.requireToken ? 'requireToken' : null,
      b?.apikeyWithToken ? 'apikeyWithToken' : null
    ].filter(Boolean).join(',')
    return `${name} → ${b?.base || '(no base!)'}${flags ? ` [${flags}]` : ''}`
  }).join(', ')
  console.log(`[tlv2-proxy] ${prefix} — ${names.length} backend(s): ${summary}`)
})
