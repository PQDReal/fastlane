import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data: articles } = await supabase
    .from('manual_articles')
    .select('id, title, content_html')
    .ilike('model_id', '%VF 3%')
    .not('content_html', 'is', null)
    .neq('content_html', '')
    .like('content_html', '%<img%')
    .limit(1)
    
  if (articles && articles.length > 0) {
    console.log('Found:', articles[0].id, articles[0].title)
    import('fs').then(fs => fs.writeFileSync('scratch-manual.html', articles[0].content_html))
  } else {
    console.log('No articles found')
  }
}
run()
