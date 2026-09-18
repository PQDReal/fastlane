import type { Metadata } from 'next'
import { InfoSection, PublicInfoPage } from '@/components/public-info-page'

export const metadata: Metadata = {
  title: 'Điều khoản sử dụng | FASTLANE',
  description: 'Điều khoản sử dụng website và dịch vụ FASTLANE.',
}

export default function TermsPage() {
  return (
    <PublicInfoPage
      eyebrow="Pháp lý"
      title="Điều khoản sử dụng"
      intro="Khi truy cập website, tạo tài khoản hoặc thực hiện giao dịch, bạn xác nhận đã đọc và đồng ý với các điều khoản sử dụng dưới đây."
    >
      <InfoSection title="1. Tài khoản và thông tin khách hàng">
        <p>Khách hàng có trách nhiệm cung cấp thông tin chính xác, cập nhật và bảo mật thông tin đăng nhập của mình.</p>
        <p>Mọi hoạt động phát sinh từ tài khoản được xem là do chủ tài khoản thực hiện, trừ khi khách hàng thông báo kịp thời về việc sử dụng trái phép.</p>
      </InfoSection>
      <InfoSection title="2. Sản phẩm và giao dịch">
        <p>Thông tin về giá, phiên bản, màu sắc, chương trình ưu đãi và thời gian giao xe có thể thay đổi theo từng thời điểm. Nội dung xác nhận trong đơn hàng và hợp đồng là căn cứ áp dụng cho giao dịch.</p>
        <p>Đơn hàng chỉ được xử lý theo các bước tiếp theo sau khi hệ thống hoặc nhân viên FASTLANE xác nhận đủ điều kiện giao dịch và thanh toán.</p>
      </InfoSection>
      <InfoSection title="3. Sử dụng website">
        <p>Không được sử dụng website để thực hiện hành vi gian lận, phát tán mã độc, thu thập dữ liệu trái phép hoặc gây ảnh hưởng đến hoạt động của hệ thống.</p>
        <p>FASTLANE có thể tạm ngừng một phần dịch vụ để bảo trì, cập nhật hoặc xử lý sự cố bảo mật.</p>
      </InfoSection>
      <InfoSection title="4. Sở hữu trí tuệ và liên hệ">
        <p>Nội dung, hình ảnh, logo, giao diện và phần mềm trên website thuộc FASTLANE hoặc các bên cấp phép. Việc sao chép, phân phối hoặc sử dụng cho mục đích thương mại cần có chấp thuận bằng văn bản.</p>
        <p>Nếu cần hỗ trợ về điều khoản, hãy <a className="font-semibold text-slate-950 underline underline-offset-4" href="/support">liên hệ bộ phận CSKH</a>.</p>
      </InfoSection>
    </PublicInfoPage>
  )
}
