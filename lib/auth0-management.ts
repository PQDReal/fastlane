import 'server-only'

type TokenResponse = {
  access_token: string
  expires_in: number
}

export type Auth0ManagedUser = {
  user_id: string
  email: string
  name?: string
  blocked?: boolean
  user_metadata?: { phone_number?: string | null }
}

export class Auth0ManagementError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'Auth0ManagementError'
  }
}

let cachedToken: { value: string; expiresAt: number } | null = null

function configuration() {
  const issuer = process.env.AUTH0_ISSUER_BASE_URL
  const domain =
    process.env.AUTH0_DOMAIN ||
    (issuer ? new URL(issuer).host : undefined)
  const clientId = process.env.AUTH0_MANAGEMENT_CLIENT_ID
  const clientSecret = process.env.AUTH0_MANAGEMENT_CLIENT_SECRET

  if (!domain || !clientId || !clientSecret) {
    throw new Auth0ManagementError(
      503,
      'Auth0 Management API chưa được cấu hình.',
    )
  }

  return {
    origin: `https://${domain}`,
    audience: `https://${domain}/api/v2/`,
    clientId,
    clientSecret,
  }
}

async function accessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value
  }

  const config = configuration()
  const response = await fetch(`${config.origin}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      audience: config.audience,
    }),
    cache: 'no-store',
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Auth0ManagementError(
      503,
      payload.error_description ||
        'Không thể kết nối Auth0 Management API.',
    )
  }

  const token = payload as TokenResponse
  cachedToken = {
    value: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000,
  }
  return token.access_token
}

async function managementRequest<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const config = configuration()
  const token = await accessToken()
  const response = await fetch(`${config.origin}/api/v2${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...init.headers,
    },
    cache: 'no-store',
  })

  if (response.status === 204) return undefined as T

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Auth0ManagementError(
      response.status,
      payload.message || payload.error || 'Auth0 Management API thất bại.',
    )
  }
  return payload as T
}

export function createAuth0User(input: {
  email: string
  password: string
  fullName: string
  phoneNumber: string | null
}) {
  return managementRequest<Auth0ManagedUser>('/users', {
    method: 'POST',
    body: JSON.stringify({
      connection:
        process.env.AUTH0_DATABASE_CONNECTION ||
        'Username-Password-Authentication',
      email: input.email,
      password: input.password,
      name: input.fullName,
      blocked: false,
      email_verified: false,
      user_metadata: { phone_number: input.phoneNumber },
    }),
  })
}

export function updateAuth0User(
  subject: string,
  input: {
    email?: string
    fullName?: string
    phoneNumber?: string | null
    blocked?: boolean
    role?: 'ADMIN' | 'CUSTOMER'
  },
) {
  const body: Record<string, unknown> = {}
  if (input.email !== undefined) body.email = input.email
  if (input.fullName !== undefined) body.name = input.fullName
  if (input.phoneNumber !== undefined) {
    body.user_metadata = { phone_number: input.phoneNumber }
  }
  if (input.blocked !== undefined) body.blocked = input.blocked
  if (input.role !== undefined) body.app_metadata = { role: input.role }

  return managementRequest<Auth0ManagedUser>(
    `/users/${encodeURIComponent(subject)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  )
}

export function deleteAuth0User(subject: string) {
  return managementRequest<void>(`/users/${encodeURIComponent(subject)}`, {
    method: 'DELETE',
  })
}
