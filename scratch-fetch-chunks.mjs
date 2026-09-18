import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data: chunks } = await supabase
    .from('manual_article_chunks')
    .select('image_url')
    .not('image_url', 'is', null)
    
  const counts = {}
  for (const c of chunks) {
    counts[c.image_url] = (counts[c.image_url] || 0) + 1
  }
  
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  console.log('Top frequent images:')
  console.log(sorted.slice(0, 20).map(([url, count]) => `${count}x: ${url}`).join('\n'))
}
run()
