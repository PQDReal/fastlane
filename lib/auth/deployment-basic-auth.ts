const VNPAY_IPN_PATH = '/api/v1/payments/vnpay/ipn'

export type DeploymentBasicAuthConfig = {
  enabled: boolean
  username?: string
  password?: string
}

export function readDeploymentBasicAuthConfig(
  environment: NodeJS.ProcessEnv = process.env,
): DeploymentBasicAuthConfig {
  return {
    enabled: environment.DEPLOY_BASIC_AUTH_ENABLED?.trim().toLowerCase() === 'true',
    username: environment.DEPLOY_BASIC_AUTH_USER?.trim() || undefined,
    password: environment.DEPLOY_BASIC_AUTH_PASSWORD || undefined,
  }
}

export function isDeploymentBasicAuthExempt(pathname: string, method: string) {
  return pathname === VNPAY_IPN_PATH && method.toUpperCase() === 'GET'
}

export function hasValidDeploymentBasicAuth(
  authorization: string | null,
  config: DeploymentBasicAuthConfig,
) {
  if (!config.enabled) return true
  if (!config.username || !config.password || !authorization?.startsWith('Basic ')) {
    return false
  }

  try {
    const credentials = atob(authorization.slice(6))
    const separator = credentials.indexOf(':')
    if (separator < 0) return false

    return credentials.slice(0, separator) === config.username
      && credentials.slice(separator + 1) === config.password
  } catch {
    return false
  }
}
