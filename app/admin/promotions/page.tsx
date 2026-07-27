import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { AdminPromotionsTable, type Promotion } from './promotions-table'

export const dynamic = 'force-dynamic'

export default async function AdminPromotionsPage() {
  const supabase = getSupabaseAdmin()
  const current = await supabase
    .from('promotions')
    .select('id,code,name,description,type,value,applicable_product_type,max_discount_amount,minimum_order_amount,starts_at,ends_at,is_active,created_at,updated_at')
    .order('created_at', { ascending: false })

  let data: unknown[] | null = current.data
  let error = current.error

  if (current.error) {
    const legacy = await supabase
      .from('promotions')
      .select('id,code,name,description,type,value,applicable_vehicle_type,max_discount_amount,minimum_order_amount,starts_at,ends_at,is_active,created_at,updated_at')
      .order('created_at', { ascending: false })

    data = legacy.data?.map(({ applicable_vehicle_type, ...item }) => ({
      ...item,
      applicable_product_type: applicable_vehicle_type,
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