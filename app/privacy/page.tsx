import type { Metadata } from 'next'
import { InfoSection, PublicInfoPage } from '@/components/public-info-page'

export const metadata: Metadata = {
  title: 'Chính sách bảo mật | FASTLANE',
  description: 'Chính sách bảo vệ dữ liệu cá nhân của khách hàng FASTLANE.',
}

export default function PrivacyPage() {
  return (
    <PublicInfoPage
      eyebrow="Pháp lý"
      title="Chính sách bảo mật"
      intro="FASTLANE tôn trọng quyền riêng tư và cam kết xử lý dữ liệu cá nhân minh bạch, đúng mục đích trong suốt quá trình khách hàng sử dụng website và dịch vụ."
    >
      <InfoSection title="1. Dữ liệu chúng tôi thu thập">
        <p>Chúng tôi có thể thu thập thông tin bạn cung cấp khi tạo tài khoản, đặt xe, đặt cọc, thanh toán, đăng ký lái thử hoặc gửi yêu cầu hỗ trợ.</p>
        <p>Dữ liệu kỹ thuật như địa chỉ IP, thiết bị, trình duyệt và lịch sử tương tác có thể được ghi nhận để bảo mật hệ thống và cải thiện trải nghiệm.</p>
      </InfoSection>
      <InfoSection title="2. Mục đích sử dụng">
        <p>Thông tin được sử dụng để xử lý đơn hàng, xác nhận thanh toán, cung cấp dịch vụ hậu mãi, liên hệ hỗ trợ và gửi thông báo liên quan đến giao dịch.</p>
        <p>FASTLANE chỉ sử dụng thông tin cho các mục đích phù hợp với thông báo này hoặc khi pháp luật yêu cầu.</p>
      </InfoSection>
      <InfoSection title="3. Chia sẻ và bảo vệ dữ liệu">
        <p>Thông tin chỉ được chia sẻ với các đối tác cần thiết để hoàn tất dịch vụ, chẳng hạn cổng thanh toán, đơn vị vận chuyển hoặc showroom thực hiện đơn hàng.</p>
        <p>Chúng tôi áp dụng biện pháp kiểm soát truy cập, mã hóa và giám sát phù hợp để hạn chế truy cập, sử dụng hoặc tiết lộ trái phép.</p>
      </InfoSection>
      <InfoSection title="4. Quyền của khách hàng">
        <p>Bạn có thể yêu cầu truy cập, cập nhật hoặc xóa dữ liệu cá nhân của mình, trừ trường hợp việc lưu giữ là cần thiết để đáp ứng nghĩa vụ pháp lý hoặc giải quyết tranh chấp.</p>
        <p>Để thực hiện quyền của mình, vui lòng liên hệ <a className="font-semibold text-slate-950 underline underline-offset-4" href="mailto:fastlane.support@gmail.com">fastlane.support@gmail.com</a>.</p>
      </InfoSection>
    </PublicInfoPage>
  )
}
