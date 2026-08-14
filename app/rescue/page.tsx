import type { Metadata } from 'next'
import { CheckCircle2, MapPin, PhoneCall } from 'lucide-react'
import { InfoSection, PublicInfoPage } from '@/components/public-info-page'

export const metadata: Metadata = {
  title: 'Dịch vụ cứu hộ 24/7 | FASTLANE',
  description: 'Hướng dẫn liên hệ và phạm vi hỗ trợ cứu hộ FASTLANE.',
}

export default function RescuePage() {
  return (
    <PublicInfoPage
      eyebrow="Hỗ trợ"
      title="Dịch vụ cứu hộ 24/7"
      intro="Khi phương tiện gặp sự cố trên đường, hãy gọi tổng đài để được tiếp nhận thông tin và hướng dẫn phương án hỗ trợ phù hợp."
    >
      <div className="rounded-3xl bg-slate-950 p-8 text-white sm:p-10">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <PhoneCall className="text-brand-300" size={28} />
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-white/55">Hotline cứu hộ khẩn cấp</p>
            <a href="tel:1900232389" className="mt-2 block text-4xl font-semibold tracking-tight text-white sm:text-5xl">1900 xxxx</a>
          </div>
          <a href="tel:1900232389" className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300">Gọi ngay</a>
        </div>
      </div>
      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
          <MapPin className="text-brand-700" size={24} />
          <h2 className="mt-6 text-xl font-semibold text-slate-950">Thông tin cần cung cấp</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
            <li>• Vị trí hiện tại hoặc điểm dễ nhận biết.</li>
            <li>• Biển số xe và số điện thoại liên hệ.</li>
            <li>• Tình trạng xe, mức độ hư hỏng hoặc cảnh báo trên xe.</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
          <CheckCircle2 className="text-brand-700" size={24} />
          <h2 className="mt-6 text-xl font-semibold text-slate-950">Phạm vi hỗ trợ</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
            <li>• Hướng dẫn xử lý sự cố đơn giản tại chỗ.</li>
            <li>• Sửa chữa trên đường trong khả năng cung cấp.</li>
            <li>• Kéo xe đến xưởng dịch vụ phù hợp khi cần thiết.</li>
          </ul>
        </div>
      </div>
      <div className="mt-12">
        <InfoSection title="Lưu ý">
          <p>Phạm vi, điều kiện áp dụng và chi phí (nếu có) phụ thuộc tình trạng xe, thời hạn bảo hành và đánh giá của đơn vị cứu hộ. Nhân viên tổng đài sẽ thông báo trước khi triển khai.</p>
        </InfoSection>
      </div>
    </PublicInfoPage>
  )
}
