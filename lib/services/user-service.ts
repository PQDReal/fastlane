import 'server-only'

import { getSupabaseAdmin } from '@/lib/supabase-admin'

export type Auth0SessionUser = {
  sub: string
  email?: string | null
  name?: string | null
  phone_number?: string | null
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

  const { data, error } = await getSupabaseAdmin()
    .from('users')
    .upsert(
      {
        auth0_subject: subject,
        email,
        full_name: user.name?.trim() || email,
        phone_number: user.phone_number?.trim() || null,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'auth0_subject',
      },
    )
    .select(
      'id, auth0_subject, email, full_name, phone_number, role, status, created_at, updated_at',
    )
    .single<LocalUser>()

  if (error) {
    throw new Error(`Unable to synchronize Auth0 user: ${error.message}`)
  }

  return data
}