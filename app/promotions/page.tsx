import { ChevronRight, Ticket } from 'lucide-react'
import Link from 'next/link'

import { Footer } from '@/components/footer'
import { Header } from '@/components/header'
import { PromotionsList, type PromotionListItem } from '@/components/promotions-list'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

type PromotionRow = {
  id: string
  code: string
  name: string
  description: string | null
  type: 'PERCENT' | 'FIXED'
  value: number
  applicable_product_type: 'ALL' | 'CAR' | 'BIKE' | 'ACCESSORY'
  max_discount_amount: number | null
  minimum_order_amount: number
  ends_at: string
}

const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value)
const formatDate = (value: string) => new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
const PROMOTION_THUMBNAIL = '/images/car-sale.png'
const productPresentation = {
  ALL: { label: 'Tất cả sản phẩm', image: '/images/maxresdefault.jpg', href: '/cars' },
  CAR: { label: 'Ô tô điện', image: '/images/vf9.png', href: '/cars' },
  BIKE: { label: 'Xe máy điện', image: '/images/vento.png', href: '/bikes' },
  ACCESSORY: { label: 'Phụ kiện', image: '/images/vf8.png', href: '/accessories' },
} as const

function details(item: PromotionRow) {
  const discount = item.type === 'PERCENT' ? `${item.value}%` : money(item.value)
  const conditions = [
    item.minimum_order_amount > 0 ? `Áp dụng cho đơn hàng từ ${money(item.minimum_order_amount)}.` : null,
    item.max_discount_amount !== null ? `Mức giảm tối đa ${money(item.max_discount_amount)}.` : null,
  ].filter(Boolean).join(' ')
  return [item.description || discount, conditions].filter(Boolean).join('\n\n')
}

async function loadPromotions(): Promise<PromotionRow[]> {
  const supabase = getSupabaseAdmin()
  const now = new Date().toISOString()
  const current = await supabase.from('promotions')
    .select('id,code,name,description,type,value,applicable_product_type,max_discount_amount,minimum_order_amount,ends_at')
    .eq('is_active', true).lte('starts_at', now).gte('ends_at', now).order('ends_at')
  if (!current.error) return (current.data ?? []) as PromotionRow[]

  const legacy = await supabase.from('promotions')
    .select('id,code,name,description,type,value,applicable_vehicle_type,max_discount_amount,minimum_order_amount,ends_at')
    .eq('is_active', true).lte('starts_at', now).gte('ends_at', now).order('ends_at')
  if (legacy.error) throw new Error('Không thể tải dữ liệu khuyến mãi.')
  return (legacy.data ?? []).map(({ applicable_vehicle_type, ...item }) => ({ ...item, applicable_product_type: applicable_vehicle_type })) as PromotionRow[]
}

export default async function PromotionsPage() {
  let promotions: PromotionRow[] = []
  let loadError = false
  try { promotions = await loadPromotions() } catch { loadError = true }
  const promotionItems: PromotionListItem[] = promotions.map((item) => {
    const product = productPresentation[item.applicable_product_type] ?? productPresentation.ALL
    return {
      id: item.id,
      title: item.name,
      desc: details(item),
      productType: item.applicable_product_type,
      productLabel: product.label,
      expires: formatDate(item.ends_at),
      image: PROMOTION_THUMBNAIL,
      code: item.code,
      discount: item.type === 'PERCENT' ? `${item.value}%` : money(item.value),
    }
  })

  return <main className="flex min-h-screen flex-col bg-background pt-[74px]">
    <Header />
    <section className="relative overflow-hidden bg-foreground py-32 text-background lg:py-40">
      <div className="absolute inset-0 z-0 opacity-20"><img src="/images/maxresdefault.jpg" alt="" className="h-full w-full object-cover" /></div>
      <div className="absolute inset-0 z-10 bg-gradient-to-t from-foreground to-transparent" />
      <div className="relative z-20 mx-auto max-w-[1440px] px-6 text-center lg:px-12">
        <div className="mb-8 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/50"><Link href="/" className="transition-colors hover:text-white">Trang chủ</Link><ChevronRight size={14}/><span className="text-white">Khuyến mãi</span></div>
        <h1 className="text-5xl font-bold tracking-tight sm:text-7xl">Ưu đãi độc quyền</h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-white/70">Khám phá các chương trình ưu đãi đang diễn ra tại Fastlane.</p>
      </div>
    </section>
    <section className="relative z-30 mx-auto -mt-16 w-full max-w-[1000px] px-6 py-20 lg:px-12">
      {promotionItems.length > 0 ? <PromotionsList promotions={promotionItems} /> : <div className="rounded-3xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm"><Ticket className="mx-auto h-10 w-10 text-slate-300"/><h2 className="mt-4 text-xl font-bold text-slate-900">{loadError ? 'Không thể tải khuyến mãi' : 'Chưa có khuyến mãi đang diễn ra'}</h2><p className="mt-2 text-sm text-slate-500">{loadError ? 'Vui lòng thử tải lại trang sau.' : 'Các chương trình ưu đãi mới sẽ sớm được cập nhật.'}</p></div>}
    </section>
    <Footer />
  </main>
}