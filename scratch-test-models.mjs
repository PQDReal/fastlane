import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data: models, error: err1 } = await supabase.from('manual_models').select('*')
  console.log('models:', models)
  
  const { data: chunks, error: err2 } = await supabase.from('manual_article_chunks').select('id, article_id').limit(5)
  console.log('chunks count:', chunks?.length)
}
run()
