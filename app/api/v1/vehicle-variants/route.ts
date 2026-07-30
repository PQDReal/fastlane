import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: Request) {
  const supabase = getSupabaseAdmin()
  
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get('product_id')
  const productName = searchParams.get('product_name')

  let dbQuery = supabase
    .from('vehicle_variants')
    .select('*')
    .order('created_at', { ascending: false })

  if (productId) {
    dbQuery = dbQuery.eq('product_id', productId)
  }
  if (productName) {
    dbQuery = dbQuery.ilike('product_name', `%${productName}%`)
  }

  const { data, error } = await dbQuery

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
