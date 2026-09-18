import { NextResponse } from 'next/server'

import { createServerTiming, type ServerTimingRecorder } from '@/lib/api/server-timing'
import { getCurrentUser } from '@/lib/auth/current-user'
import { auth0 } from '@/lib/auth0'
import { updateAuth0UsersByEmail } from '@/lib/auth0-management'
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

async function authenticatedUser(timing?: ServerTimingRecorder) {
  try {
    return await getCurrentUser(timing)
  } catch (error) {
    console.error('Unable to load authenticated profile:', error)
    return null
  }
}

export async function GET() {
  const timing = createServerTiming('route')
  const authenticationStartedAt = performance.now()
  const user = await authenticatedUser(timing)
  timing.measure('authentication', authenticationStartedAt)
  if (!user) {
    return timing.attach(errorResponse(401, 'AUTHENTICATION_REQUIRED', 'Authentication required'))
  }

  const transformStartedAt = performance.now()
  const response = NextResponse.json(responseData(user))
  timing.measure('transform', transformStartedAt)
  return timing.attach(response)
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

  const changedFullName = fullName !== undefined && fullName !== user.full_name
    ? fullName
    : undefined
  const changedPhoneNumber = phoneNumber !== undefined && phoneNumber !== user.phone_number
    ? phoneNumber
    : undefined

  const session = await auth0.getSession()
  if (!session) {
    return errorResponse(401, 'AUTHENTICATION_REQUIRED', 'Authentication required')
  }

  let updatedUser: LocalUser
  try {
    updatedUser = changedFullName === undefined && changedPhoneNumber === undefined
      ? user
      : await updateUserProfile(user.auth0_subject, {
          fullName: changedFullName,
          phoneNumber: changedPhoneNumber,
        })
  } catch (error) {
    console.error('Unable to update local profile:', error)
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Unable to update profile')
  }

  try {
    if (changedFullName !== undefined || changedPhoneNumber !== undefined) {
      await updateAuth0UsersByEmail(user.email, session.user.sub, {
        fullName: changedFullName,
        phoneNumber: changedPhoneNumber,
      })
    }
  } catch (error) {
    console.error('Unable to synchronize profile with Auth0:', error)
    await updateUserProfile(user.auth0_subject, {
      fullName: user.full_name,
      phoneNumber: user.phone_number,
    }).catch((rollbackError) => {
      console.error('Unable to roll back local profile:', rollbackError)
    })
    return errorResponse(502, 'AUTH0_SYNC_FAILED', 'Unable to synchronize profile with Auth0')
  }

  try {
    await auth0.updateSession({
      ...session,
      user: {
        ...session.user,
        ...(changedFullName !== undefined ? { name: changedFullName } : {}),
        ...(changedPhoneNumber !== undefined ? { phone_number: changedPhoneNumber } : {}),
      },
    })
  } catch (error) {
    // Auth0 and the database are already synchronized. A later session refresh
    // will pick up these claims if the cookie cannot be refreshed right now.
    console.error('Unable to refresh the profile session:', error)
  }

  return NextResponse.json(responseData(updatedUser))
}
