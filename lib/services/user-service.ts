import 'server-only'

import { getSupabaseAdmin } from '@/lib/supabase-admin'

export type Auth0SessionUser = {
  sub: string
  email?: string | null
  email_verified?: boolean | null
  name?: string | null
  phone_number?: string | null
}

export class Auth0EmailUnverifiedError extends Error {
  constructor() {
    super('Auth0 email must be verified before accessing the application')
    this.name = 'Auth0EmailUnverifiedError'
  }
}

export type LocalUser = {
  id: string
  auth0_subject: string
  email: string
  full_name: string
  phone_number: string | null
  role: 'ADMIN' | 'CUSTOMER'
  status: 'ACTIVE' | 'INACTIVE'
  created_at: string
  updated_at: string
}

export async function findUserByAuth0Subject(
  subject: string,
): Promise<LocalUser | null> {
  const normalizedSubject = subject.trim()

  if (!normalizedSubject) return null

  const { data, error } = await getSupabaseAdmin()
    .from('users')
    .select(
      'id, auth0_subject, email, full_name, phone_number, role, status, created_at, updated_at',
    )
    .eq('auth0_subject', normalizedSubject)
    .maybeSingle<LocalUser>()

  if (error) {
    throw new Error(`Unable to load local user: ${error.message}`)
  }

  return data
}

export async function findUserByEmail(email: string): Promise<LocalUser | null> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) return null

  const { data, error } = await getSupabaseAdmin()
    .from('users')
    .select(
      'id, auth0_subject, email, full_name, phone_number, role, status, created_at, updated_at',
    )
    .eq('email', normalizedEmail)
    .maybeSingle<LocalUser>()

  if (error) {
    throw new Error(`Unable to load local user by email: ${error.message}`)
  }

  return data
}
export type UpdateLocalUserProfile = {
  fullName?: string
  phoneNumber?: string | null
}

export async function updateUserProfile(
  subject: string,
  profile: UpdateLocalUserProfile,
): Promise<LocalUser> {
  const updates: Record<string, string | null> = {
    updated_at: new Date().toISOString(),
  }

  if (profile.fullName !== undefined) updates.full_name = profile.fullName
  if (profile.phoneNumber !== undefined) updates.phone_number = profile.phoneNumber

  const { data, error } = await getSupabaseAdmin()
    .from('users')
    .update(updates)
    .eq('auth0_subject', subject)
    .select(
      'id, auth0_subject, email, full_name, phone_number, role, status, created_at, updated_at',
    )
    .single<LocalUser>()

  if (error) {
    throw new Error(`Unable to update local user: ${error.message}`)
  }

  return data
}
export async function syncAuth0User(
  user: Auth0SessionUser,
): Promise<LocalUser> {
  const subject = user.sub.trim()
  const email = user.email?.trim().toLowerCase()

  if (!subject) {
    throw new Error('Auth0 session is missing the subject claim')
  }

  if (!email) {
    throw new Error('Auth0 session is missing the email claim')
  }

  const existingUser = await findUserByAuth0Subject(subject)
  if (existingUser) {
    if (existingUser.email === email) return existingUser

    const { data, error } = await getSupabaseAdmin()
      .from('users')
      .update({
        email,
        updated_at: new Date().toISOString(),
      })
      .eq('auth0_subject', subject)
      .select(
        'id, auth0_subject, email, full_name, phone_number, role, status, created_at, updated_at',
      )
      .single<LocalUser>()

    if (error) {
      throw new Error(`Unable to synchronize Auth0 user email: ${error.message}`)
    }

    return data
  }

  const existingEmailUser = await findUserByEmail(email)
  if (existingEmailUser) {
    if (user.email_verified !== true) {
      throw new Auth0EmailUnverifiedError()
    }
    return existingEmailUser
  }

  if (user.email_verified !== true) {
    throw new Auth0EmailUnverifiedError()
  }

  const { data, error } = await getSupabaseAdmin()
    .from('users')
    .insert({
      auth0_subject: subject,
      email,
      full_name: user.name?.trim() || email,
      phone_number: user.phone_number?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .select(
      'id, auth0_subject, email, full_name, phone_number, role, status, created_at, updated_at',
    )
    .single<LocalUser>()

  if (error) {
    throw new Error(`Unable to synchronize Auth0 user: ${error.message}`)
  }

  return data
}