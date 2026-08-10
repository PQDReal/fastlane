import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: Request) {
  const supabase = getSupabaseAdmin()
  
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get('product_id')
  const productName = searchParams.get('product_name')

  let dbQuery = supabase
    .from('vehicle_variants')
    .select('id,product_id,product_name,product_type,variant_name,sku,price,deposit_amount,color,image_car_url,image_color_url,version,is_active,created_at,updated_at,product_variant_id')
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (productId) {
    dbQuery = dbQuery.eq('product_id', productId)
  }
  if (productName) {
    // The deposit page sends the short display name (for example "VF 2"),
    // while vehicle_variants stores the canonical name ("VinFast VF 2").
    // Match the short name as a contained token; product_id remains the
    // preferred exact filter whenever it is available.
    const normalized = productName.trim().replace(/[%_]/g, '')
    dbQuery = dbQuery.ilike('product_name', `%${normalized}%`)
  }

  const { data, error } = await dbQuery

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>
  const productVariantIds = rows
    .map((row) => typeof row.product_variant_id === 'string' ? row.product_variant_id : null)
    .filter((id): id is string => Boolean(id))
  const inventoryByVariant = new Map<string, { on_hand_quantity: number; updated_at: string | null }>()
  if (productVariantIds.length > 0) {
    const { data: inventory, error: inventoryError } = await supabase
      .from('inventory_items')
      .select('variant_id,on_hand_quantity,updated_at')
      .in('variant_id', productVariantIds)
    if (inventoryError) return NextResponse.json({ error: inventoryError.message }, { status: 500 })
    for (const item of inventory ?? []) {
      inventoryByVariant.set(item.variant_id, {
        on_hand_quantity: Number(item.on_hand_quantity ?? 0),
        updated_at: item.updated_at ?? null,
      })
    }
  }
  return NextResponse.json(rows.map((row) => ({
    ...row,
    inventory: row.product_variant_id
      ? inventoryByVariant.get(String(row.product_variant_id)) ?? { on_hand_quantity: 0, updated_at: null }
      : null,
  })))
}
