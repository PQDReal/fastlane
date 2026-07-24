import { NextResponse } from 'next/server'

export class ApiRouteError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Array<{
      path: string
      code: string
      meta?: Record<string, unknown>
    }>,
  ) {
    super(message)
    this.name = 'ApiRouteError'
  }
}

export function apiErrorResponse(error: unknown) {
  const requestId = crypto.randomUUID()

  if (error instanceof ApiRouteError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          requestId,
          ...(error.fields ? { fields: error.fields } : {}),
        },
      },
      { status: error.status },
    )
  }

  console.error(`[${requestId}] Unhandled API error`, error)
  return NextResponse.json(
    {
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
        requestId,
      },
    },
    { status: 500 },
  )
}

export async function readJsonBody(request: Request) {
  try {
    return await request.json()
  } catch {
    throw new ApiRouteError(
      400,
      'VALIDATION_ERROR',
      'Request body must be valid JSON.',
      [{ path: '$', code: 'INVALID_FORMAT' }],
    )
  }
}
