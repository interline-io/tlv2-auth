import { useRuntimeConfig } from '#imports'
import { DEFAULT_PROXY_PREFIX } from '../util/defaults'

export const useApiEndpoint = (path?: string, clientName?: string) => {
  clientName = clientName || 'default'
  let base = ''
  const config = useRuntimeConfig()
  if (import.meta.server) {
    // Server-side: use the direct backend URL (proxyBase)
    const proxyBases: Record<string, string> = config.tlv2?.proxyBase || {}
    base = (proxyBases[clientName] || '')
  }
  if (import.meta.client) {
    // Client-side: route through the per-backend proxy
    const proxyPrefix = config.public.tlv2?.proxyPrefix || DEFAULT_PROXY_PREFIX
    base = window.location.origin + proxyPrefix + '/' + clientName
  }
  return base + (path || '')
}
