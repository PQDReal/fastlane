import { getSupabaseAdmin } from './lib/supabase-admin'
import { createOpenAI } from '@ai-sdk/openai'
import { embed } from 'ai'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function run() {
  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY || '',
  })

  const { embedding } = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: 'cổng sạc',
  })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.rpc('match_manual_chunks', {
    query_embedding: `[${embedding.join(',')}]`,
    match_threshold: 0.1,
    match_count: 5,
    filter_model_series: 'VF 5',
    filter_year: '2023'
  })

  console.log('Error:', error)
  console.log('Data:', JSON.stringify(data, null, 2))
}

run().catch(console.error)
