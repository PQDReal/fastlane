const { createClient } = require('@supabase/supabase-js')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRoleKey) {
  throw new Error('Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.')
}

const supabase = createClient(url, serviceRoleKey)
supabase
  .from('products')
  .select('name')
  .textSearch('search_vector', 'vf:* & 3:*', { config: 'simple' })
  .then(console.log)
