import { navigateTo, useRuntimeConfig } from '#imports'
import { DEFAULT_AUTH_PREFIX } from '../util/defaults'

export const useLogout = async () => {
  const config = useRuntimeConfig()
  const authPrefix = config.public.tlv2?.authPrefix || DEFAULT_AUTH_PREFIX
  return navigateTo(`${authPrefix}/logout`, { external: true })
}
