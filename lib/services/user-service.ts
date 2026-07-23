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
  created_at: string
  updated_at: string
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
      'id, auth0_subject, email, full_name, phone_number, role, created_at, updated_at',
    )
    .single<LocalUser>()

  if (error) {
    throw new Error(`Unable to synchronize Auth0 user: ${error.message}`)
  }

  return data
}