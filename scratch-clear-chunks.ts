import { getSupabaseAdmin } from './lib/supabase-admin'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function run() {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('manual_article_chunks').delete().neq('id', '00000000-0000-0000-0000-000000000000') // delete all
  console.log('Error deleting chunks:', error)
}

run().catch(console.error)
