import { useRuntimeConfig } from '#imports'
import { DEFAULT_PROXY_PREFIX } from '../util/defaults'
import { resolveProxyBackends } from '../util/backends'

export const useApiEndpoint = (path?: string, clientName?: string) => {
  clientName = clientName || 'default'
  let base = ''
  const config = useRuntimeConfig()
  if (import.meta.server) {
    // Server-side: hit the backend base URL directly.
    base = resolveProxyBackends(config)[clientName]?.base || ''
  }
  if (import.meta.client) {
    // Client-side: route through the proxy.
    const proxyPrefix = config.public.tlv2proxy?.prefix || DEFAULT_PROXY_PREFIX
    base = window.location.origin + proxyPrefix + '/' + clientName
  }
  return base + (path || '')
}
