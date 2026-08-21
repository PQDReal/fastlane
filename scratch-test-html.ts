import { getSupabaseAdmin } from './lib/supabase-admin'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function run() {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('manual_articles')
    .select('content_html')
    .not('content_html', 'is', null)
    .limit(1)

  if (data && data.length > 0) {
    console.log('Sample HTML:', data[0].content_html.substring(0, 1000))
  }
}

run().catch(console.error)
