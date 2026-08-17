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
  email_verified: boolean
  created_at: string
  updated_at: string
}

const LOCAL_USER_SELECT =
  'id, auth0_subject, email, full_name, phone_number, role, status, email_verified, created_at, updated_at'

export async function findUserById(id: string): Promise<LocalUser | null> {
  const normalizedId = id.trim()
  if (!normalizedId) return null

  const { data, error } = await getSupabaseAdmin()
    .from('users')
    .select(LOCAL_USER_SELECT)
    .eq('id', normalizedId)
    .maybeSingle<LocalUser>()

  if (error) {
    throw new Error(`Unable to load local user by id: ${error.message}`)
  }

  return data
}

export async function findUserByAuth0Subject(
  subject: string,
): Promise<LocalUser | null> {
  const normalizedSubject = subject.trim()

  if (!normalizedSubject) return null

  const { data, error } = await getSupabaseAdmin()
    .from('users')
    .select(LOCAL_USER_SELECT)
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
    .select(LOCAL_USER_SELECT)
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
      'id, auth0_subject, email, full_name, phone_number, role, status, email_verified, created_at, updated_at',
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
    const verificationChanged = typeof user.email_verified === 'boolean'
      && existingUser.email_verified !== user.email_verified
    if (existingUser.email === email && !verificationChanged) return existingUser

    const updates: Record<string, string | boolean> = {
      email,
      updated_at: new Date().toISOString(),
    }
    if (typeof user.email_verified === 'boolean') updates.email_verified = user.email_verified

    const { data, error } = await getSupabaseAdmin()
      .from('users')
      .update(updates)
      .eq('auth0_subject', subject)
      .select(
        'id, auth0_subject, email, full_name, phone_number, role, status, email_verified, created_at, updated_at',
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
    if (existingEmailUser.email_verified) return existingEmailUser

    const { data, error } = await getSupabaseAdmin()
      .from('users')
      .update({ email_verified: true, updated_at: new Date().toISOString() })
      .eq('id', existingEmailUser.id)
      .select(
        'id, auth0_subject, email, full_name, phone_number, role, status, email_verified, created_at, updated_at',
      )
      .single<LocalUser>()

    if (error) {
      throw new Error(`Unable to synchronize Auth0 email verification: ${error.message}`)
    }

    return data
  }


  const { data, error } = await getSupabaseAdmin()
    .from('users')
    .insert({
      auth0_subject: subject,
      email,
      full_name: user.name?.trim() || email,
      phone_number: user.phone_number?.trim() || null,
      email_verified: user.email_verified === true,
      updated_at: new Date().toISOString(),
    })
    .select(
      'id, auth0_subject, email, full_name, phone_number, role, status, email_verified, created_at, updated_at',
    )
    .single<LocalUser>()

  if (error) {
    throw new Error(`Unable to synchronize Auth0 user: ${error.message}`)
  }

  if (user.email_verified !== true) {
    throw new Auth0EmailUnverifiedError()
  }

  return data
}
