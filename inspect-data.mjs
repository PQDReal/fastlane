import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env' })
dotenv.config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')

const supabase = createClient(url, key)

const productId = 'e05c1fe5-66db-4b67-8c32-03845d3b6070' // VF 0

const { data: vv } = await supabase
  .from('vehicle_variants')
  .select('id, variant_name, sku, color, version, product_variant_id')
  .eq('product_id', productId)

console.log('Vehicle Variants of VF 0:', vv)
