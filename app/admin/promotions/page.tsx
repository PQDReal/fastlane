import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { AdminPromotionsTable, type Promotion } from './promotions-table'

export const dynamic = 'force-dynamic'

export default async function AdminPromotionsPage() {
  const { data, error } = await getSupabaseAdmin()
    .from('promotions')
    .select('id,code,name,type,value,starts_at,ends_at,is_active,created_at,updated_at')
    .order('created_at', { ascending: false })

  return (
    <AdminPromotionsTable
      promotions={(data ?? []) as Promotion[]}
      loadError={error ? 'Không thể tải dữ liệu khuyến mãi từ hệ thống.' : null}
    />
  )
}