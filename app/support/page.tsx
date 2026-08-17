import type { Metadata } from 'next'
import { Mail, MessageCircle, Phone } from 'lucide-react'
import { InfoSection, PublicInfoPage } from '@/components/public-info-page'

export const metadata: Metadata = {
  title: 'Liên hệ CSKH | FASTLANE',
  description: 'Các kênh liên hệ chăm sóc khách hàng FASTLANE.',
}

export default function SupportPage() {
  return (
    <PublicInfoPage
      eyebrow="Hỗ trợ"
      title="Liên hệ chăm sóc khách hàng"
      intro="Đội ngũ CSKH FASTLANE sẵn sàng hỗ trợ bạn về sản phẩm, đơn hàng, thanh toán và các dịch vụ sau bán."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <a href="tel:1900232389" className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-brand-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          <Phone className="text-brand-700" size={24} />
          <p className="mt-6 text-xs font-bold uppercase tracking-widest text-slate-500">Tổng đài</p>
          <p className="mt-2 text-xl font-semibold text-slate-950">1900 xxxx</p>
        </a>
        <a href="mailto:support@fastlane.vn" className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-brand-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          <Mail className="text-brand-700" size={24} />
          <p className="mt-6 text-xs font-bold uppercase tracking-widest text-slate-500">Email</p>
          <p className="mt-2 break-all text-lg font-semibold text-slate-950">fastlane.support@gmail.com</p>
        </a>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <MessageCircle className="text-brand-700" size={24} />
          <p className="mt-6 text-xs font-bold uppercase tracking-widest text-slate-500">Thời gian hỗ trợ</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">24/7</p>
        </div>
      </div>
      <div className="mt-12">
        <InfoSection title="Khi liên hệ, bạn nên chuẩn bị">
          <ul className="list-disc space-y-2 pl-5">
            <li>Mã đơn hàng hoặc mã giao dịch cần kiểm tra.</li>
            <li>Số điện thoại hoặc email đã dùng khi đặt hàng.</li>
            <li>Mô tả ngắn gọn sự cố và ảnh chụp màn hình nếu có.</li>
          </ul>
        </InfoSection>
        <InfoSection title="Địa chỉ tiếp nhận">
          <p>Trung tâm CSKH FASTLANE tiếp nhận yêu cầu trực tuyến qua tổng đài và email. Nhân viên sẽ phản hồi, phân loại và chuyển yêu cầu đến bộ phận phù hợp.</p>
        </InfoSection>
      </div>
    </PublicInfoPage>
  )
}
