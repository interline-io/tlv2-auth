import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
import { proxyBackends } from '../../util/backends'
import { DEFAULT_PROXY_PREFIX } from '../../util/defaults'

// Logs the proxy backends once at server startup so a deploy can be verified
// from the logs.
export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  const prefix = config.public?.tlv2proxy?.prefix || DEFAULT_PROXY_PREFIX
  const backends = proxyBackends(config)
  const names = Object.keys(backends)
  if (!names.length) {
    console.warn('[tlv2-proxy] no backends configured — tlv2proxy.backends is empty')
    return
  }
  const summary = names.map((name) => {
    const b = backends[name]
    return `${name} → ${b?.base || '(no base!)'}${b?.requireToken ? ' [requireToken]' : ''}`
  }).join(', ')
  console.log(`[tlv2-proxy] ${prefix} — ${names.length} backend(s): ${summary}`)
})
