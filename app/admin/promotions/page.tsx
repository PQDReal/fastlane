import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { productTypesFromLegacy } from '@/lib/promotions/product-types'
import { AdminPromotionsTable, type Promotion } from './promotions-table'

export const dynamic = 'force-dynamic'

const SELECT = 'id,code,name,description,type,value,applicable_product_types,max_discount_amount,minimum_order_amount,usage_limit,used_count,starts_at,ends_at,is_active,is_public,created_at,updated_at'
const LEGACY_SELECT = 'id,code,name,description,type,value,applicable_product_type,max_discount_amount,minimum_order_amount,usage_limit,used_count,starts_at,ends_at,is_active,created_at,updated_at'

export default async function AdminPromotionsPage() {
  const supabase = getSupabaseAdmin()
  const current = await supabase.from('promotions').select(SELECT).order('created_at', { ascending: false })

  let data: unknown[] | null = current.data
  let error = current.error

  if (current.error) {
    const legacy = await supabase.from('promotions').select(LEGACY_SELECT).order('created_at', { ascending: false })
    data = legacy.data?.map(({ applicable_product_type, ...item }) => ({
      ...item,
      applicable_product_types: productTypesFromLegacy(applicable_product_type),
      is_public: true,
    })) ?? null
    error = legacy.error
  }

  return (
    <AdminPromotionsTable
      promotions={(data ?? []) as Promotion[]}
      loadError={error ? 'Không thể tải dữ liệu khuyến mãi từ hệ thống.' : null}
    />
  )
}