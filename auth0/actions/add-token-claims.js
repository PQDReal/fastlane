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

  // New sign-ups do not have an Auth0 role yet. Grant only the least-privileged
  // application role; Admin still requires an explicit Auth0 role assignment.
  const effectiveRoles = roles.length > 0 ? roles : ['customer']

  api.accessToken.setCustomClaim(rolesClaim, effectiveRoles)
  api.idToken.setCustomClaim(rolesClaim, effectiveRoles)

  // Supabase Third-Party Auth expects this literal claim in the ID token.
  // Do not add it to the Auth0 access token: Auth0 strips non-namespaced
  // custom claims there, and the API must receive the API access token instead.
  api.idToken.setCustomClaim('role', 'authenticated')
}
