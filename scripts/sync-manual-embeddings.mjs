import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { embedManualArticle } from '../lib/sales-agent/knowledge/manual-embedder.js'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

async function main() {
  console.log('Fetching VF 3 manual articles...')
  const { data: articles, error } = await supabase
    .from('manual_articles')
    .select('id, title, model_id')
    .order('created_at', { ascending: false })

  if (error || !articles) {
    console.error('Failed to fetch articles:', error)
    process.exit(1)
  }

  console.log(`Found ${articles.length} articles to process.`)

  let successCount = 0
  let skipCount = 0
  let errorCount = 0

  for (const article of articles) {
    try {
      console.log(`Processing article: ${article.title} (${article.id})`)
      const chunkCount = await embedManualArticle(article.id)
      
      if (chunkCount > 0) {
        console.log(`  -> Generated ${chunkCount} chunks.`)
        successCount++
      } else {
        console.log(`  -> Skipped (no content).`)
        skipCount++
      }
    } catch (err) {
      console.error(`  -> Error processing ${article.id}:`, err.message)
      errorCount++
    }
  }

  console.log('\n--- Sync Complete ---')
  console.log(`Total: ${articles.length}`)
  console.log(`Success: ${successCount}`)
  console.log(`Skipped: ${skipCount}`)
  console.log(`Errors: ${errorCount}`)
}

main().catch((err) => {
  console.error('Unhandled error:', err)
  process.exit(1)
})
