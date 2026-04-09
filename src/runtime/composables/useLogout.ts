import { navigateTo, useRuntimeConfig } from '#imports'

export const useLogout = async () => {
  const config = useRuntimeConfig()
  const authPrefix = config.public.tlv2?.authPrefix || '/auth'
  return navigateTo(`${authPrefix}/logout`, { external: true })
}
