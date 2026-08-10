import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function RescuePage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl mb-6">
        <Link href="/" className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Trở về trang chủ
        </Link>
      </div>
      <div className="mx-auto max-w-4xl bg-white p-8 md:p-12 rounded-2xl shadow-sm border border-slate-100">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-8">Dịch vụ Cứu hộ 24/7</h1>
        <div className="prose prose-slate max-w-none">
          <p className="lead text-lg text-slate-600 mb-8">
            An tâm trên mọi hành trình với dịch vụ cứu hộ khẩn cấp hoạt động xuyên suốt ngày đêm.
          </p>
          <div className="bg-red-50 border border-red-100 rounded-xl p-6 mb-8 text-center">
            <h2 className="text-red-600 font-bold text-xl mb-2">HOTLINE CỨU HỘ KHẨN CẤP</h2>
            <p className="text-4xl font-black text-red-700 tracking-wider">1900 9999</p>
          </div>
          <div className="space-y-6 text-slate-700">
            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">Phạm vi hỗ trợ</h2>
              <p>
                Dịch vụ cứu hộ 24/7 của Fastlane phủ sóng trên toàn lãnh thổ Việt Nam. Bất kể bạn đang ở đâu, trên cao tốc hay đường mòn, chúng tôi luôn có mặt kịp thời.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">Các trường hợp hỗ trợ miễn phí</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>Xe hết pin/chết máy dọc đường.</li>
                <li>Xịt lốp, nổ lốp cần thay lốp dự phòng.</li>
                <li>Lỗi phần mềm điều khiển ảnh hưởng đến khả năng vận hành.</li>
                <li>Kéo xe về xưởng dịch vụ gần nhất trong trường hợp hư hỏng nặng.</li>
              </ul>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">Thời gian phản hồi</h2>
              <p>
                Chúng tôi cam kết có mặt tại hiện trường trong vòng 30 - 45 phút đối với khu vực nội thành, và từ 1 - 2 tiếng đối với khu vực ngoại ô và cao tốc.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
