import { NextResponse } from 'next/server'

import { authorizeAdminInventoryRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type JoinedCategory = { name: string }
type JoinedProduct = { id: string; name: string; product_type: string; is_active: boolean; categories: JoinedCategory | JoinedCategory[] | null }
type JoinedInventory = { on_hand_quantity: number; updated_at: string } | null
type VariantRow = {
  id: string
  sku: string
  name: string
  is_active: boolean
  products: JoinedProduct | JoinedProduct[] | null
  inventory_items: JoinedInventory | JoinedInventory[]
}

export async function GET(request: Request) {
  try {
    await authorizeAdminInventoryRequest(request)
  } catch (error) {
    if (error instanceof ApiAuthError) return authErrorResponse(error)
    throw error
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('product_variants')
    .select('id,sku,name,is_active,products(id,name,product_type,is_active,categories(name)),inventory_items(on_hand_quantity,updated_at)')
    .order('sku', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Vehicle placeholders without a color/version/SKU are model-level catalog
  // rows, not sellable inventory. Keep them in the database for history, but
  // exclude them from the admin stock monitor. Accessories remain unchanged.
  const { data: vehicleRows, error: vehicleError } = await supabase
    .from('vehicle_variants')
    .select('product_variant_id,product_type,sku,variant_name,version,color,is_active')
    .eq('is_active', true)
  if (vehicleError) return NextResponse.json({ error: vehicleError.message }, { status: 500 })
  const validVehicleIds = new Set((vehicleRows ?? [])
    .filter((row) => ['CAR', 'BIKE'].includes(String(row.product_type).toUpperCase()))
    .filter((row) => row.product_variant_id && (row.sku || row.variant_name || row.version) && row.color)
    .map((row) => String(row.product_variant_id)))

  const items = ((data ?? []) as unknown as VariantRow[]).filter((variant) => {
    const product = Array.isArray(variant.products) ? variant.products[0] : variant.products
    const type = String(product?.product_type ?? '').toUpperCase()
    return !['CAR', 'BIKE'].includes(type) || validVehicleIds.has(variant.id)
  }).map((variant) => {
    const product = Array.isArray(variant.products) ? variant.products[0] : variant.products
    const inventory = Array.isArray(variant.inventory_items) ? variant.inventory_items[0] : variant.inventory_items
    const category = Array.isArray(product?.categories) ? product.categories[0] : product?.categories

    return {
      variantId: variant.id,
      sku: variant.sku,
      productName: product?.name ?? 'Chưa xác định',
      variantName: variant.name,
      productType: product?.product_type ?? 'UNKNOWN',
      categoryName: category?.name ?? null,
      onHandQuantity: inventory?.on_hand_quantity ?? 0,
      updatedAt: inventory?.updated_at ?? null,
      variantIsActive: variant.is_active,
      productIsActive: Boolean(product?.is_active),
      isActive: Boolean(variant.is_active && product?.is_active),
    }
  })

  return NextResponse.json(items)
}
