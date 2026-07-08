import { useRuntimeConfig } from '#imports'
import { DEFAULT_PROXY_PREFIX } from '../util/defaults'

// Build a same-origin proxy URL for a backend. Both browser and SSR go
// through the proxy — one credential path, no direct-to-backend leg. On the
// client this is absolute (window origin); on the server it is a relative
// path that $fetch/useFetch dispatch to the proxy in-process. Native fetch
// cannot take a relative URL on the server — use useProxySsrFetch there.
export const useApiEndpoint = (path?: string, clientName?: string) => {
  clientName = clientName || 'default'
  const config = useRuntimeConfig()
  const proxyPrefix = config.public.tlv2proxy?.prefix || DEFAULT_PROXY_PREFIX
  const origin = import.meta.client ? window.location.origin : ''
  return `${origin}${proxyPrefix}/${clientName}${path || ''}`
}
