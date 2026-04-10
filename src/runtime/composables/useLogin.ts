import { navigateTo, useRoute, useRuntimeConfig } from '#imports'
import { DEFAULT_AUTH_PREFIX } from '../util/defaults'

export const useLogin = async (targetUrl: null | string) => {
  const route = useRoute()
  const config = useRuntimeConfig()
  const authPrefix = config.public.tlv2?.authPrefix || DEFAULT_AUTH_PREFIX
  targetUrl = targetUrl || route.fullPath
  // Prevent redirect loops: don't set returnTo to an auth route
  if (targetUrl === authPrefix || targetUrl.startsWith(authPrefix + '/')) {
    targetUrl = '/'
  }
  return navigateTo(`${authPrefix}/login?returnTo=` + encodeURIComponent(targetUrl), { external: true })
}
