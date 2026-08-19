import { getSupabaseAdmin } from './lib/supabase-admin'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function run() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('manual_article_chunks')
    .select('article_id, section_title, content, image_url')
    .not('image_url', 'is', null)
    .limit(5)

  console.log('Error:', error)
  console.log('Images:', JSON.stringify(data, null, 2))
}

run().catch(console.error)
