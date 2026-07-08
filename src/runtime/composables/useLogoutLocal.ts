import { navigateTo, useRuntimeConfig } from '#imports'
import { DEFAULT_AUTH_PREFIX } from '../util/defaults'

// Log out locally: clears the session cookie without auth0's federated
// /oidc/logout round-trip, so the SSO session survives and re-login is silent.
export const useLogoutLocal = async () => {
  const config = useRuntimeConfig()
  const authPrefix = config.public.tlv2?.authPrefix || DEFAULT_AUTH_PREFIX
  return navigateTo(`${authPrefix}/logout-local`, { external: true })
}
