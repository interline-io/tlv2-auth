import { useRuntimeConfig } from '#imports'
import { useUser } from './useUser'

export interface LoginGateOptions {
  hasRole?: string
  hasAnyRole?: string[]
  excludeAnyRole?: string[]
}

/**
 * Returns true if the gate should block access, false if access is allowed.
 */
export const useLoginGate = (options: LoginGateOptions): boolean => {
  const config = useRuntimeConfig()
  if (!config.public.tlv2?.loginGate) {
    return false
  }

  const user = useUser()
  if (!user.loggedIn) {
    return true
  }

  for (const excludeRole of options.excludeAnyRole || []) {
    if (user.hasRole(excludeRole)) {
      return true
    }
  }

  const requiredRoles = [...(options.hasAnyRole || [])]
  if (options.hasRole) {
    requiredRoles.push(options.hasRole)
  }

  if (requiredRoles.length === 0) {
    return false
  }

  return !requiredRoles.some(r => user.hasRole(r))
}
