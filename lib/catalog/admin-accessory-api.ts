import 'server-only'

import { NextResponse } from 'next/server'

import { AdminAccessoryPersistenceError } from '@/lib/catalog/admin-accessory-server'
import { AdminAccessoryWriteValidationError } from '@/lib/catalog/admin-accessory-write'

type StandardErrorCode =
  | 'VALIDATION_FAILED'
  | 'RESOURCE_NOT_FOUND'
  | 'CONFLICT'
  | 'BUSINESS_RULE_VIOLATION'
  | 'INTERNAL_ERROR'

export function adminAccessoryErrorResponse(
  status: number,
  code: StandardErrorCode,
  message: string,
  options: {
    field?: { path: string; code: 'REQUIRED' | 'UNKNOWN_FIELD' | 'INVALID_FORMAT' | 'INVALID_VALUE'; rule?: string }
    meta?: Record<string, unknown>
  } = {},
) {
  const fields = options.field ? [{
    path: options.field.path,
    code: options.field.code,
    ...(options.field.rule ? { meta: { rule: options.field.rule } } : {}),
  }] : undefined
  return NextResponse.json({
    error: {
      code,
      message,
      requestId: crypto.randomUUID(),
      ...(fields ? { fields } : {}),
      ...(options.meta ? { meta: options.meta } : {}),
    },
  }, { status })
}

export function adminAccessoryValidationResponse(error: AdminAccessoryWriteValidationError) {
  const fieldCode = error.code === 'UNKNOWN_FIELD'
    ? 'UNKNOWN_FIELD'
    : error.code.includes('REQUIRED')
      ? 'REQUIRED'
      : error.code.includes('FORMAT') || error.code.includes('URL') || error.code.includes('UUID')
        ? 'INVALID_FORMAT'
        : 'INVALID_VALUE'
  return adminAccessoryErrorResponse(400, 'VALIDATION_FAILED', error.message, {
    field: { path: error.path, code: fieldCode, rule: error.code },
  })
}

export function adminAccessoryPersistenceResponse(error: AdminAccessoryPersistenceError) {
  const code: StandardErrorCode = error.status === 404
    ? 'RESOURCE_NOT_FOUND'
    : error.status === 409
      ? 'CONFLICT'
      : error.status === 422
        ? 'BUSINESS_RULE_VIOLATION'
        : 'INTERNAL_ERROR'
  return adminAccessoryErrorResponse(error.status, code, error.message, {
    meta: { reason: error.code },
  })
}
