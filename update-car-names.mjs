import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env' })
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !supabaseKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  console.log('Fetching deposit orders with vehicle variants...')
  const { data: orders, error } = await supabase
    .from('deposit_orders')
    .select('id, car_model, car_variant, vehicle_variant_id, vehicle_variants(product_name, variant_name, version)')

  if (error) {
    console.error('Error fetching data:', error)
    return
  }

  console.log(`Found ${orders.length} orders.`)
  let updateCount = 0

  for (const order of orders) {
    if (order.vehicle_variant_id && order.vehicle_variants) {
      const productName = order.vehicle_variants.product_name || order.car_model
      const variantName = order.vehicle_variants.variant_name || order.vehicle_variants.version || ''

      // Only update if it's different
      if (order.car_model !== productName || order.car_variant !== variantName) {
        console.log(`Updating order ${order.id}: ${order.car_model} -> ${productName}, ${order.car_variant} -> ${variantName}`)
        const { error: updateError } = await supabase
          .from('deposit_orders')
          .update({
            car_model: productName,
            car_variant: variantName
          })
          .eq('id', order.id)

        if (updateError) {
          console.error(`Error updating order ${order.id}:`, updateError)
        } else {
          updateCount++
        }
      }
    }
  }

  console.log(`Successfully updated ${updateCount} orders.`)
}

run()
