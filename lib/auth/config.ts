export interface Auth0ApiConfig {
  audience: string
  issuer: string
  jwksUri: URL
  rolesClaim: string
}

function required(environment: NodeJS.ProcessEnv, name: string) {
  const value = environment[name]?.trim()

  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`)
  }

  return value
}

function secureUrl(value: string, name: string) {
  const url = new URL(value)

  if (url.protocol !== 'https:') {
    throw new Error(`${name} must use https`)
  }

  return url
}

export function readAuth0ApiConfig(
  environment: NodeJS.ProcessEnv = process.env,
): Auth0ApiConfig {
  const audience = required(environment, 'AUTH0_AUDIENCE')
  const clientId = required(environment, 'AUTH0_CLIENT_ID')
  const domain = required(environment, 'AUTH0_DOMAIN').toLowerCase()
  const issuerUrl = secureUrl(
    required(environment, 'AUTH0_ISSUER_BASE_URL'),
    'AUTH0_ISSUER_BASE_URL',
  )
  const jwksUri = secureUrl(
    required(environment, 'AUTH0_JWKS_URI'),
    'AUTH0_JWKS_URI',
  )
  const rolesClaimUrl = secureUrl(
    required(environment, 'AUTH0_ROLE_CLAIM'),
    'AUTH0_ROLE_CLAIM',
  )

  if (issuerUrl.search || issuerUrl.hash || issuerUrl.username || issuerUrl.password) {
    throw new Error('AUTH0_ISSUER_BASE_URL must be a plain issuer URL')
  }

  if (issuerUrl.pathname !== '/' && issuerUrl.pathname !== '') {
    throw new Error('AUTH0_ISSUER_BASE_URL must not contain a path')
  }

  if (jwksUri.origin !== issuerUrl.origin) {
    throw new Error('AUTH0_JWKS_URI must have the same origin as the issuer')
  }

  if (domain !== issuerUrl.hostname.toLowerCase()) {
    throw new Error('AUTH0_DOMAIN must identify the same tenant as the issuer')
  }

  if (audience === clientId) {
    throw new Error('AUTH0_AUDIENCE must differ from AUTH0_CLIENT_ID')
  }

  issuerUrl.pathname = '/'

  return {
    audience,
    issuer: issuerUrl.toString(),
    jwksUri,
    rolesClaim: rolesClaimUrl.toString(),
  }
}
