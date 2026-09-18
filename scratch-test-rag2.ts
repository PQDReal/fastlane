import { getSupabaseAdmin } from './lib/supabase-admin'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function run() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('manual_article_chunks').select('*').ilike('content', '%cổng sạc%').limit(10)

  console.log('Error:', error)
  console.log('Data:', JSON.stringify(data, null, 2))
}

run().catch(console.error)
