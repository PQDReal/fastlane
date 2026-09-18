import type { Metadata } from 'next'
import { Building2, CalendarDays } from 'lucide-react'
import Link from 'next/link'
import { InfoSection, PublicInfoPage } from '@/components/public-info-page'
import { ShowroomsClient } from './showrooms-client'

export const metadata: Metadata = {
  title: 'Hệ thống showroom | FASTLANE',
  description: 'Thông tin hệ thống showroom và điểm trải nghiệm FASTLANE.',
}

export default function ShowroomsPage() {
  return (
    <PublicInfoPage
      eyebrow=""
      title="Hệ thống showroom"
      intro=""
      maxWidth="max-w-7xl"
    >
      <ShowroomsClient />
      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-slate-950 p-7 text-white">
          <Building2 className="text-brand-300" size={25} />
          <h2 className="mt-6 text-2xl font-semibold">Tìm điểm phù hợp</h2>
          <p className="mt-3 text-sm leading-6 text-white/65">Liên hệ CSKH để được cung cấp showroom gần vị trí của bạn và giờ làm việc mới nhất.</p>
          <a href="tel:1900232389" className="mt-6 inline-flex rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300">Gọi 1900 xxxx</a>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-7">
          <CalendarDays className="text-brand-700" size={25} />
          <h2 className="mt-6 text-2xl font-semibold text-slate-950">Đăng ký lái thử</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">Chọn thời gian thuận tiện để đội ngũ tư vấn chuẩn bị xe và liên hệ xác nhận.</p>
          <Link href="/test-drive" className="mt-6 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">Đặt lịch lái thử</Link>
        </div>
      </div>
      <div className="mt-12">
        <InfoSection title="Trước khi đến showroom">
          <p>Vui lòng gọi trước để kiểm tra mẫu xe, màu xe, chương trình ưu đãi và thời gian phục vụ tại điểm bạn muốn đến.</p>
        </InfoSection>
      </div>
    </PublicInfoPage>
  )
}
