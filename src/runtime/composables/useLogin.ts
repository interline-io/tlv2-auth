import { navigateTo, useRoute, useRuntimeConfig } from '#imports'

export const useLogin = async (targetUrl: null | string) => {
  const route = useRoute()
  const config = useRuntimeConfig()
  const authPrefix = config.public.tlv2?.authPrefix || '/auth'
  targetUrl = targetUrl || route.fullPath
  return navigateTo(`${authPrefix}/login?returnTo=` + encodeURIComponent(targetUrl), { external: true })
}
