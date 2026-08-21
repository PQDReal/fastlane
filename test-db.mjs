import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env' })
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !supabaseKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  const { data, error } = await supabase.from('deposit_orders').select('*').limit(1)
  console.log('Query result:', data, error)
  
  // Try inserting a dummy order to test the status constraint
  const { data: insData, error: insErr } = await supabase.from('deposit_orders').insert({
    order_number: 'TEST-12345',
    full_name: 'Test',
    phone_number: '0123456789',
    email: 'test@test.com',
    id_card_number: '123',
    province: 'test',
    ward: 'test',
    car_model: 'VF 3',
    car_variant: 'Eco',
    exterior_color: 'Black',
    interior_color: 'Black',
    payment_method: 'bank_transfer',
    total_estimated_price: 300000000,
    status: 'PENDING_CONFIRMATION'
  })
  
  console.log('Insert result:', insErr ? insErr.message : 'Success')
  
  // clean up
  await supabase.from('deposit_orders').delete().eq('order_number', 'TEST-12345')
}

test()
