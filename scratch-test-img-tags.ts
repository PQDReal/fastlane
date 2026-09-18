import { getSupabaseAdmin } from './lib/supabase-admin'
import dotenv from 'dotenv'
import * as cheerio from 'cheerio'

dotenv.config({ path: '.env.local' })

async function run() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('manual_articles')
    .select('id, title, content_html')
    .ilike('content_html', '%<img%')

  console.log('Total articles with img tags:', data?.length)
  
  if (data && data.length > 0) {
    const article = data[0]
    const $ = cheerio.load(article.content_html)
    const images = $('img').map((i, el) => $(el).attr('src')).get()
    console.log('Images in first article:', images)
  }
}

run().catch(console.error)
