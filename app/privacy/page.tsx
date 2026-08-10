import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl mb-6">
        <Link href="/" className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Trở về trang chủ
        </Link>
      </div>
      <div className="mx-auto max-w-4xl bg-white p-8 md:p-12 rounded-2xl shadow-sm border border-slate-100">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-8">Chính sách bảo mật</h1>
        <div className="prose prose-slate max-w-none">
          <p className="lead text-lg text-slate-600 mb-8">
            Chào mừng bạn đến với Fastlane. Việc bảo vệ dữ liệu cá nhân và quyền riêng tư của bạn là ưu tiên hàng đầu của chúng tôi. Trang này giải thích chi tiết cách thức chúng tôi thu thập, sử dụng, và bảo vệ thông tin của bạn khi truy cập và sử dụng dịch vụ của Fastlane.
          </p>
          <div className="space-y-6 text-slate-700">
            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Thu thập thông tin cá nhân</h2>
              <p>
                Chúng tôi thu thập thông tin cá nhân của bạn khi bạn đăng ký tài khoản, sử dụng dịch vụ, tải ứng dụng hoặc liên hệ với bộ phận chăm sóc khách hàng. Các thông tin này bao gồm nhưng không giới hạn ở tên đầy đủ, ngày sinh, địa chỉ email, số điện thoại, địa chỉ nhận hàng và thông tin thẻ tín dụng hoặc các phương thức thanh toán khác.
              </p>
              <p className="mt-2">
                Ngoài ra, chúng tôi cũng có thể tự động thu thập một số thông tin kỹ thuật khi bạn truy cập trang web như địa chỉ IP, loại trình duyệt, thời gian truy cập, và các trang bạn đã xem thông qua cookie và các công nghệ theo dõi tương tự để nâng cao trải nghiệm người dùng.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">2. Mục đích sử dụng thông tin</h2>
              <p>
                Thông tin cá nhân của bạn được sử dụng chủ yếu để cung cấp dịch vụ một cách tốt nhất. Cụ thể, chúng tôi sử dụng dữ liệu để xử lý giao dịch đặt xe, thanh toán hợp đồng, cung cấp dịch vụ bảo hành và hỗ trợ khách hàng nhanh chóng.
              </p>
              <p className="mt-2">
                Chúng tôi cũng có thể sử dụng dữ liệu này để phân tích xu hướng thị trường, nâng cấp hệ thống, cá nhân hóa các gợi ý sản phẩm và gửi các thông báo quan trọng về thay đổi chính sách hay các chương trình khuyến mãi (nếu bạn đồng ý nhận).
              </p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">3. Bảo vệ và lưu trữ dữ liệu</h2>
              <p>
                Dữ liệu của bạn được lưu trữ trên các máy chủ đám mây an toàn, tuân thủ các tiêu chuẩn bảo mật quốc tế ISO 27001 và PCI-DSS cho thanh toán. Chúng tôi áp dụng các biện pháp mã hóa đầu cuối, tường lửa, và hệ thống phát hiện xâm nhập để đảm bảo dữ liệu không bị truy cập, tiết lộ, thay đổi hoặc phá hủy trái phép.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">4. Chia sẻ thông tin với bên thứ ba</h2>
              <p>
                Fastlane cam kết tuyệt đối không bán, trao đổi hoặc cho thuê thông tin cá nhân của bạn cho bất kỳ bên thứ ba nào vì mục đích thương mại. 
              </p>
              <p className="mt-2">
                Chúng tôi chỉ chia sẻ thông tin khi bắt buộc theo yêu cầu từ cơ quan pháp luật, hoặc chia sẻ cho các đối tác chiến lược trực tiếp tham gia vào việc vận hành dịch vụ (như đối tác thanh toán VNPAY, đối tác vận chuyển, đối tác bảo hiểm) dưới những ràng buộc bảo mật nghiêm ngặt nhất.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Quyền lợi của bạn</h2>
              <p>
                Bạn có toàn quyền truy cập, chỉnh sửa hoặc yêu cầu xóa bỏ thông tin cá nhân của mình khỏi hệ thống của Fastlane bất cứ lúc nào bằng cách truy cập vào phần Cài đặt tài khoản hoặc liên hệ trực tiếp với bộ phận Chăm sóc khách hàng của chúng tôi.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
