import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env' })
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !supabaseKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  console.log('Fetching all deposit orders and all vehicle variants...')
  
  const { data: variants, error: varError } = await supabase
    .from('vehicle_variants')
    .select('id, product_name, variant_name, version, color')
    
  if (varError) {
    console.error('Error fetching variants:', varError)
    return
  }

  const { data: orders, error: orderError } = await supabase
    .from('deposit_orders')
    .select('id, car_model, car_variant, exterior_color, vehicle_variant_id, order_number')

  if (orderError) {
    console.error('Error fetching orders:', orderError)
    return
  }

  let updateCount = 0

  for (const order of orders) {
    // Only attempt to fix orders that are pointing to a base variant (where car_variant is empty)
    // Actually, let's just re-resolve all of them to be safe based on their original text if possible,
    // wait, we already updated car_model/car_variant so they might be empty now for those bad ones.
    // Let's use the DB's car_model and we'll have to rely on their exterior_color if car_variant is empty,
    // or maybe the original order text is lost?
    // Fortunately, we know exterior_color is still correct!
    // We can match by product_name and color.
    
    // We know that for VF 8 Plus / VF 3 Plus / VF 8 Eco, we overwrote car_variant with '' because we mapped them wrong.
    // Let's use product_name and exterior_color to find the correct variant!
    const model = order.car_model || ''
    const color = order.exterior_color || ''
    
    // Find matching variant
    const matchingVv = variants.find(vv => {
      const pNameMatch = vv.product_name?.toLowerCase().includes(model.toLowerCase()) || model.toLowerCase().includes(vv.product_name?.toLowerCase() || '')
      const colorMatch = color && vv.color ? vv.color.toLowerCase() === color.toLowerCase() : (!color && !vv.color)
      return pNameMatch && colorMatch
    })

    if (matchingVv) {
      if (order.vehicle_variant_id !== matchingVv.id || order.car_variant !== matchingVv.variant_name) {
        console.log(`Fixing order ${order.order_number}: new variant ID ${matchingVv.id}, new variant name: ${matchingVv.variant_name}`)
        const { error: updateError } = await supabase
          .from('deposit_orders')
          .update({
            vehicle_variant_id: matchingVv.id,
            car_variant: matchingVv.variant_name || matchingVv.version || ''
          })
          .eq('id', order.id)
          
        if (updateError) {
          console.error(`Error updating order ${order.id}:`, updateError)
        } else {
          updateCount++
        }
      }
    } else {
      console.log(`Could not find a better matching variant for order ${order.order_number} (Model: ${model}, Color: ${color})`)
    }
  }

  console.log(`Successfully fixed ${updateCount} orders.`)
}

run()
