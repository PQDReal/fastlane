import { createClient } from '@supabase/supabase-js'

const url = 'https://tpvsoegkztjnwxirogkp.supabase.co'
const key = 'REDACTED_PUBLIC_HISTORY'

const supabase = createClient(url, key)

const productId = 'e05c1fe5-66db-4b67-8c32-03845d3b6070' // VF 0

const { data: vv } = await supabase
  .from('vehicle_variants')
  .select('id, variant_name, sku, color, version, product_variant_id')
  .eq('product_id', productId)

console.log('Vehicle Variants of VF 0:', vv)
