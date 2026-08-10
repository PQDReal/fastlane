import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function PaymentPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl mb-6">
        <Link href="/" className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Trở về trang chủ
        </Link>
      </div>
      <div className="mx-auto max-w-4xl bg-white p-8 md:p-12 rounded-2xl shadow-sm border border-slate-100">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-8">Chính sách thanh toán</h1>
        <div className="prose prose-slate max-w-none">
          <p className="lead text-lg text-slate-600 mb-8">
            Fastlane cam kết cung cấp các giải pháp thanh toán an toàn, minh bạch và tiện lợi nhất cho khách hàng. Vui lòng đọc kỹ thông tin dưới đây về các quy định và phương thức giao dịch hiện hành trên nền tảng của chúng tôi.
          </p>
          <div className="space-y-6 text-slate-700">
            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Các phương thức thanh toán hỗ trợ</h2>
              <p>
                Hệ thống Fastlane chấp nhận nhiều phương thức thanh toán linh hoạt để tối đa hóa sự thuận tiện, bao gồm:
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li><strong>Ví điện tử & Cổng thanh toán:</strong> Hỗ trợ thanh toán nhanh chóng qua cổng VNPAY bằng mã QR hoặc ứng dụng Mobile Banking của các ngân hàng nội địa.</li>
                <li><strong>Thẻ thanh toán quốc tế:</strong> Chấp nhận thanh toán bằng thẻ tín dụng và thẻ ghi nợ mang thương hiệu Visa, Mastercard, JCB, và American Express.</li>
                <li><strong>Chuyển khoản trực tiếp:</strong> Hỗ trợ chuyển khoản vào tài khoản ngân hàng chính thức của Fastlane tại các phòng giao dịch hoặc qua Internet Banking.</li>
              </ul>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">2. Bảo mật và An toàn giao dịch</h2>
              <p>
                Bảo vệ thông tin tài chính của bạn là nhiệm vụ trọng tâm. Tất cả các luồng dữ liệu thanh toán đều được truyền tải qua giao thức HTTPS có mã hóa SSL 256-bit cao cấp.
              </p>
              <p className="mt-2">
                Đồng thời, Fastlane không trực tiếp lưu trữ toàn bộ thông tin số thẻ hay mã bảo mật (CVV/CVC) của khách hàng. Mọi giao dịch thẻ đều được xử lý và Token hóa thông qua hệ thống của VNPAY và các ngân hàng đối tác chuẩn quốc tế PCI-DSS. Bạn hoàn toàn có thể yên tâm về tính bảo mật của từng giao dịch.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">3. Xác nhận và Xử lý đơn hàng</h2>
              <p>
                Sau khi thanh toán cọc thành công, hệ thống sẽ ngay lập tức gửi một thư xác nhận thanh toán kèm theo hợp đồng điện tử đến địa chỉ email đã đăng ký của bạn. Mã đơn hàng (Order ID) sẽ là căn cứ duy nhất để tra cứu hoặc giải quyết khiếu nại về sau.
              </p>
              <p className="mt-2">
                Trường hợp bạn đã bị trừ tiền trong tài khoản nhưng chưa nhận được email xác nhận hoặc trạng thái đơn hàng trên Fastlane vẫn ở mức "Chờ thanh toán", vui lòng chờ tối đa 30 phút để hệ thống đối soát hoặc gọi ngay hotline CSKH để được trợ giúp.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">4. Chính sách hoàn trả và Hủy giao dịch</h2>
              <p>
                Trong trường hợp bạn muốn hủy đặt cọc, vui lòng gửi yêu cầu hỗ trợ qua hệ thống hoặc gọi điện cho CSKH trong vòng 24 giờ. Số tiền cọc sẽ được hoàn lại (sau khi trừ đi một số chi phí hành chính nếu có, tùy thuộc vào quy định cụ thể của từng dòng xe) về đúng tài khoản ngân hàng mà bạn đã dùng để giao dịch ban đầu.
              </p>
              <p className="mt-2">
                Thời gian tiền hoàn về tài khoản phụ thuộc vào quy định xử lý của tổ chức thẻ quốc tế hoặc ngân hàng nội địa, thông thường dao động từ 3 đến 14 ngày làm việc.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
