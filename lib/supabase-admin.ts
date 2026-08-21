

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let adminClient: SupabaseClient | undefined

export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    if (process.env.npm_lifecycle_event === 'build' || !process.env.NODE_ENV || process.env.NODE_ENV !== 'production') {
      console.warn('⚠️  Missing NEXT_PUBLIC_SUPABASE_URL. Returning dummy client to allow static generation to pass.')
      adminClient = createClient('https://dummy.supabase.co', 'dummy-key', {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      return adminClient
    }
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    )
  }

  adminClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return adminClient
}