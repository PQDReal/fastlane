import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
)

const [factsResult, documentsResult] = await Promise.all([
  supabase
    .from('after_sales_published_facts')
    .select([
      'fact_id',
      'service_type',
      'vehicle_type',
      'model',
      'subject',
      'policy_entity',
      'battery_chemistry',
      'usage_condition',
      'applicability',
      'fact_type',
      'value_numeric',
      'value_text',
      'unit',
      'qualifier',
      'distance_policy',
    ].join(','))
    .eq('service_type', 'warranty')
    .eq('vehicle_type', 'motorbike'),
  supabase
    .from('sales_agent_knowledge_documents')
    .select('id,slug,title,status,published_version,summary,content_markdown')
    .eq('category', 'WARRANTY_BATTERY'),
])

process.stdout.write(`${JSON.stringify({
  facts: factsResult.data ?? [],
  factsError: factsResult.error?.message ?? null,
  documents: documentsResult.data ?? [],
  documentsError: documentsResult.error?.message ?? null,
}, null, 2)}\n`)
