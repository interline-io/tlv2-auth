// Merge the GraphQL `me` response into auth0 user claims. Promotes the common
// fields to tlv2_* claims and keeps the full response under tlv2_me so consumers
// can read anything (e.g. external_data), not just the promoted fields.
export function enrichUserClaims (
  user: Record<string, any>,
  meData: Record<string, any> | null
): Record<string, any> {
  if (!meData) { return user }
  return {
    ...user,
    tlv2_id: meData.id || '',
    tlv2_name: meData.name || '',
    tlv2_email: meData.email || '',
    tlv2_roles: meData.roles || [],
    tlv2_me: meData
  }
}
