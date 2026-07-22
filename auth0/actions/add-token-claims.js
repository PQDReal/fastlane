/**
 * Auth0 Post-Login Action for FastLane.
 *
 * Required Action secret:
 *   ROLE_CLAIM_NAMESPACE=https://fastlane.example.com/roles
 */
exports.onExecutePostLogin = async (event, api) => {
  let rolesClaim

  try {
    rolesClaim = new URL(event.secrets.ROLE_CLAIM_NAMESPACE).toString()
  } catch {
    api.access.deny('FastLane role claim namespace is not configured.')
    return
  }

  if (!rolesClaim.startsWith('https://')) {
    api.access.deny('FastLane role claim namespace is not configured.')
    return
  }

  const knownRoles = new Map([
    ['customer', 'customer'],
    ['admin', 'admin'],
  ])
  const roles = [...new Set((event.authorization?.roles ?? [])
    .filter((role) => typeof role === 'string')
    .map((role) => knownRoles.get(role.toLowerCase()))
    .filter(Boolean))]

  if (roles.length === 0) {
    api.access.deny('A FastLane Customer or Admin role is required.')
    return
  }

  api.accessToken.setCustomClaim(rolesClaim, roles)
  api.idToken.setCustomClaim(rolesClaim, roles)

  // Supabase Third-Party Auth expects this literal claim in the ID token.
  // Do not add it to the Auth0 access token: Auth0 strips non-namespaced
  // custom claims there, and the API must receive the API access token instead.
  api.idToken.setCustomClaim('role', 'authenticated')
}
