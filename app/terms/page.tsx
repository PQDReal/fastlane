import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl mb-6">
        <Link href="/" className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Trở về trang chủ
        </Link>
      </div>
      <div className="mx-auto max-w-4xl bg-white p-8 md:p-12 rounded-2xl shadow-sm border border-slate-100">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-8">Điều khoản sử dụng</h1>
        <div className="prose prose-slate max-w-none">
          <p className="lead text-lg text-slate-600 mb-8">
            Chào mừng bạn đến với nền tảng giao dịch trực tuyến của Fastlane. Bằng việc truy cập, đăng ký tài khoản, hoặc thực hiện giao dịch, bạn đồng ý tuân thủ và chịu ràng buộc bởi các Điều khoản sử dụng được quy định dưới đây.
          </p>
          <div className="space-y-6 text-slate-700">
            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Chấp nhận và Sửa đổi điều khoản</h2>
              <p>
                Người dùng cần đọc kỹ và hiểu rõ các điều khoản trước khi sử dụng hệ thống. Việc tiếp tục sử dụng đồng nghĩa với sự chấp thuận toàn bộ các quy định này. Fastlane bảo lưu quyền sửa đổi, bổ sung, hoặc loại bỏ bất kỳ phần nào của các Điều khoản này bất cứ lúc nào. Những thay đổi sẽ có hiệu lực ngay khi được đăng tải công khai trên website. Việc bạn tiếp tục sử dụng website sau những thay đổi đó cấu thành sự chấp thuận đối với các điều khoản đã được sửa đổi.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">2. Nghĩa vụ và Trách nhiệm của người dùng</h2>
              <p>
                Khi mở tài khoản tại Fastlane, bạn cam kết cung cấp thông tin cá nhân một cách trung thực, chính xác và đầy đủ. Bạn hoàn toàn chịu trách nhiệm cho mọi hoạt động diễn ra dưới tên tài khoản và mật khẩu của mình, và phải thông báo ngay cho chúng tôi nếu phát hiện bất kỳ hành vi sử dụng trái phép nào.
              </p>
              <p className="mt-2">
                Nghiêm cấm việc sử dụng nền tảng cho các mục đích vi phạm pháp luật Việt Nam, bao gồm việc phát tán mã độc, spam, lừa đảo, hoặc có hành vi làm gián đoạn, phá hoại hệ thống máy chủ và mạng lưới của Fastlane.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">3. Giao dịch và Đặt cọc</h2>
              <p>
                Khi tiến hành đặt mua xe, người dùng đồng ý tuân theo quy trình ký kết hợp đồng điện tử và đóng khoản tiền cọc theo quy định. Hợp đồng chỉ chính thức có hiệu lực sau khi Fastlane xác nhận khoản thanh toán đã thành công và gửi email xác nhận cùng mã OTP (nếu có). Mọi thông tin về giá bán, khuyến mãi có thể thay đổi tùy thuộc vào thời điểm giao dịch thực tế.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">4. Quyền sở hữu trí tuệ</h2>
              <p>
                Tất cả nội dung, nhãn hiệu, logo, thiết kế giao diện, hình ảnh sản phẩm và phần mềm trên nền tảng này hoàn toàn thuộc sở hữu trí tuệ của Fastlane và các đối tác ủy quyền. Bất kỳ hành vi sao chép, chỉnh sửa, phát tán hoặc sử dụng cho mục đích thương mại mà không có sự đồng ý bằng văn bản của Fastlane đều bị coi là vi phạm nghiêm trọng và sẽ bị xử lý theo pháp luật.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Giới hạn trách nhiệm</h2>
              <p>
                Fastlane nỗ lực tối đa để đảm bảo hệ thống vận hành trơn tru và dữ liệu chính xác, tuy nhiên không thể cam kết hệ thống không bao giờ gặp lỗi kỹ thuật hay gián đoạn mạng. Chúng tôi được miễn trừ trách nhiệm trong các trường hợp bất khả kháng, thảm họa tự nhiên, hoặc lỗi do nhà cung cấp dịch vụ bên thứ ba gây ra tổn thất cho người dùng.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
