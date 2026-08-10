import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl mb-6">
        <Link href="/" className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Trở về trang chủ
        </Link>
      </div>
      <div className="mx-auto max-w-4xl bg-white p-8 md:p-12 rounded-2xl shadow-sm border border-slate-100">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-8">Liên hệ Chăm sóc khách hàng</h1>
        <div className="prose prose-slate max-w-none">
          <p className="lead text-lg text-slate-600 mb-8">
            Đội ngũ CSKH của Fastlane luôn sẵn sàng lắng nghe và hỗ trợ bạn mọi lúc.
          </p>
          <div className="space-y-6 text-slate-700">
            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">Các kênh hỗ trợ</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Tổng đài tư vấn:</strong> 1900 1234 (Thời gian hoạt động: 8h - 22h hàng ngày)</li>
                <li><strong>Email hỗ trợ:</strong> support@fastlane.vn</li>
                <li><strong>Live Chat:</strong> Nhắn tin trực tiếp qua nút chat ở góc phải màn hình.</li>
              </ul>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">Câu hỏi thường gặp (FAQ)</h2>
              <p>
                Trước khi liên hệ, bạn có thể tham khảo mục FAQ của chúng tôi. Tại đây tổng hợp giải đáp cho hơn 80% các câu hỏi thường gặp về dịch vụ, cách sử dụng ứng dụng và các thủ tục giấy tờ.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">Địa chỉ văn phòng</h2>
              <p>
                Tòa nhà Fastlane Tower, Số 1 Đường Hạnh Phúc, Quận 1, TP. Hồ Chí Minh.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
