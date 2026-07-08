// Attach the GraphQL `me` response to the user's claims under tlv2_me;
// useUser derives id/name/email/roles/external_data from it.
export function enrichUserClaims (
  user: Record<string, any>,
  meData: Record<string, any> | null
): Record<string, any> {
  if (!meData) { return user }
  return { ...user, tlv2_me: meData }
}
