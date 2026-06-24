interface MeData {
  id?: string
  name?: string
  email?: string
  roles?: string[]
  external_data?: Record<string, unknown> | null
}

// Pure function to merge GraphQL `me` response into auth0 user claims.
// `external_data` is an opaque key-value map plumbed through from tlserver's
// authn user (e.g. via WithExternalData() in the gatekeeper middleware). We
// pass it through verbatim under `tlv2_external_data`; consumers are
// responsible for any deployment-specific shape (e.g. parsing
// `external_data.gatekeeper` as JSON).
export function enrichUserClaims (
  user: Record<string, any>,
  meData: MeData | null
): Record<string, any> {
  if (!meData) { return user }
  return {
    ...user,
    tlv2_id: meData.id || '',
    tlv2_name: meData.name || '',
    tlv2_email: meData.email || '',
    tlv2_roles: meData.roles || [],
    tlv2_external_data: meData.external_data || {}
  }
}
