import { useRuntimeConfig } from '#imports'
import { DEFAULT_PROXY_PREFIX } from '../util/defaults'

// Both browser and SSR go through the same-origin proxy — one credential path,
// no direct-to-backend leg. Client builds an absolute same-origin URL; SSR
// returns a relative path that nitro's $fetch dispatches to the proxy in-process
// (so the SSR data client must use $fetch, forwarding the request cookie).
export const useApiEndpoint = (path?: string, clientName?: string) => {
  clientName = clientName || 'default'
  const config = useRuntimeConfig()
  const proxyPrefix = config.public.tlv2proxy?.prefix || DEFAULT_PROXY_PREFIX
  const origin = import.meta.client ? window.location.origin : ''
  return `${origin}${proxyPrefix}/${clientName}${path || ''}`
}
