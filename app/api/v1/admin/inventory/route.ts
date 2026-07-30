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

  const { data, error } = await getSupabaseAdmin()
    .from('product_variants')
    .select('id,sku,name,is_active,products(id,name,product_type,is_active,categories(name)),inventory_items(on_hand_quantity,updated_at)')
    .order('sku', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const items = ((data ?? []) as unknown as VariantRow[]).map((variant) => {
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