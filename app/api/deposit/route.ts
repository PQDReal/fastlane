import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getCurrentUser } from '@/lib/auth/current-user'

export async function POST(req: Request) {
  try {
    const data = await req.json()
    const supabase = getSupabaseAdmin()

    if (!data.order_number || (!data.full_name && !data.company_name) || !data.phone_number || !data.car_model) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const finalFullName = data.full_name || data.company_name || 'Khách hàng Doanh nghiệp'
    const user = await getCurrentUser()

    const { error } = await supabase
      .from('deposit_orders')
      .insert([
        {
          order_number: data.order_number,
          customer_id: user?.id || null,
          customer_type: data.customer_type || 'personal',
          full_name: finalFullName,
          company_name: data.company_name || null,
          phone_number: data.phone_number,
          email: data.email || '',
          id_card_number: data.id_card_number || '',
          province: data.province || '',
          ward: data.ward || '',
          car_model: data.car_model,
          car_variant: data.car_variant,
          exterior_color: data.exterior_color,
          interior_color: data.interior_color,
          vehicle_variant_id: data.vehicle_variant_id || null,
          optional_packages: data.optional_packages || [],
          showroom: data.showroom || 'VinFast Landmark 81',
          sales_consultant: data.sales_consultant || null,
          payment_method: data.payment_method || 'bank_transfer',
          deposit_amount: data.deposit_amount || 10000000,
          total_estimated_price: data.total_estimated_price || 0,
          status: 'PENDING_CONFIRMATION'
        }
      ])

    if (error) {
      console.error('Error inserting deposit order:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('API Error:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
