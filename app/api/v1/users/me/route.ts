import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/current-user'
import { updateUserProfile, type LocalUser } from '@/lib/services/user-service'

const PHONE_PATTERN = /^\+?[0-9]{9,15}$/

function responseData(user: LocalUser) {
  return {
    data: {
      id: user.id,
      email: user.email,
      role: user.role.toLowerCase(),
      fullName: user.full_name,
      phoneNumber: user.phone_number,
      defaultShippingAddress: null,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    },
  }
}

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json(
    { error: { code, message, requestId: crypto.randomUUID() } },
    { status },
  )
}

async function authenticatedUser() {
  try {
    return await getCurrentUser()
  } catch (error) {
    console.error('Unable to load authenticated profile:', error)
    return null
  }
}

export async function GET() {
  const user = await authenticatedUser()
  if (!user) {
    return errorResponse(401, 'AUTHENTICATION_REQUIRED', 'Authentication required')
  }

  return NextResponse.json(responseData(user))
}

export async function PATCH(request: Request) {
  const user = await authenticatedUser()
  if (!user) {
    return errorResponse(401, 'AUTHENTICATION_REQUIRED', 'Authentication required')
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse(400, 'VALIDATION_FAILED', 'Invalid JSON request body')
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return errorResponse(400, 'VALIDATION_FAILED', 'Request body must be an object')
  }

  const input = body as Record<string, unknown>
  const allowedKeys = new Set(['fullName', 'phoneNumber'])
  if (Object.keys(input).length === 0 || Object.keys(input).some((key) => !allowedKeys.has(key))) {
    return errorResponse(400, 'VALIDATION_FAILED', 'Only fullName and phoneNumber can be updated')
  }

  if (input.fullName !== undefined && typeof input.fullName !== 'string') {
    return errorResponse(400, 'VALIDATION_FAILED', 'fullName must be a string')
  }
  if (input.phoneNumber !== undefined && input.phoneNumber !== null && typeof input.phoneNumber !== 'string') {
    return errorResponse(400, 'VALIDATION_FAILED', 'phoneNumber must be a string or null')
  }

  const fullName = input.fullName === undefined ? undefined : input.fullName.trim()
  const phoneNumber =
    input.phoneNumber === undefined || input.phoneNumber === null
      ? input.phoneNumber
      : input.phoneNumber.replace(/[\s.-]/g, '')

  if (fullName !== undefined && (fullName.length < 1 || fullName.length > 120)) {
    return errorResponse(400, 'VALIDATION_FAILED', 'fullName must contain 1 to 120 characters')
  }
  if (phoneNumber !== undefined && phoneNumber !== null && !PHONE_PATTERN.test(phoneNumber)) {
    return errorResponse(400, 'VALIDATION_FAILED', 'phoneNumber must contain 9 to 15 digits')
  }

  try {
    const updatedUser = await updateUserProfile(user.auth0_subject, { fullName, phoneNumber })
    return NextResponse.json(responseData(updatedUser))
  } catch (error) {
    console.error('Unable to update profile:', error)
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Unable to update profile')
  }
}