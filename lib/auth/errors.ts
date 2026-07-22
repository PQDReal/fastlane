export type ApiAuthErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'INVALID_ACCESS_TOKEN'
  | 'INSUFFICIENT_PERMISSION'

export class ApiAuthError extends Error {
  constructor(
    readonly status: 401 | 403,
    readonly code: ApiAuthErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ApiAuthError'
  }
}

export function authErrorResponse(
  error: ApiAuthError,
  requestId = crypto.randomUUID(),
) {
  const headers = new Headers({ 'content-type': 'application/json' })

  if (error.status === 401) {
    headers.set('www-authenticate', 'Bearer')
  }

  return new Response(
    JSON.stringify({
      error: {
        code: error.code,
        message: error.message,
        requestId,
      },
    }),
    { status: error.status, headers },
  )
}
