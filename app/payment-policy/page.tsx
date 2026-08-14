import type { Metadata } from 'next'
import { InfoSection, PublicInfoPage } from '@/components/public-info-page'

export const metadata: Metadata = {
  title: 'Chính sách thanh toán | FASTLANE',
  description: 'Quy định thanh toán, xác nhận giao dịch và hoàn tiền tại FASTLANE.',
}

export default function PaymentPolicyPage() {
  return (
    <PublicInfoPage
      eyebrow="Pháp lý"
      title="Chính sách thanh toán"
      intro="Các giao dịch trên FASTLANE được xử lý qua đối tác thanh toán được cấp phép. Vui lòng kiểm tra kỹ thông tin đơn hàng trước khi xác nhận."
    >
      <InfoSection title="1. Phương thức thanh toán">
        <p>FASTLANE hỗ trợ thanh toán trực tuyến qua cổng VNPay và các phương thức được hiển thị tại bước thanh toán của từng sản phẩm hoặc đơn hàng.</p>
        <p>Thông tin thẻ, tài khoản ngân hàng và mã xác thực được nhập trên hệ thống của đối tác thanh toán; FASTLANE không yêu cầu bạn gửi các thông tin bảo mật này qua email hoặc tin nhắn.</p>
      </InfoSection>
      <InfoSection title="2. Xác nhận giao dịch">
        <p>Sau khi thanh toán, VNPay gửi kết quả giao dịch về hệ thống FASTLANE để đối soát. Trạng thái đơn hàng chỉ được chuyển sang đã thanh toán khi kết quả hợp lệ được xác minh.</p>
        <p>Nếu tài khoản đã bị trừ tiền nhưng đơn vẫn ở trạng thái chờ xác minh, vui lòng chờ tối đa 30 phút rồi liên hệ CSKH và cung cấp mã đơn hàng.</p>
      </InfoSection>
      <InfoSection title="3. Hủy và hoàn tiền">
        <p>Yêu cầu hủy hoặc hoàn tiền được tiếp nhận theo điều kiện của từng loại đơn hàng và chính sách sản phẩm tại thời điểm giao dịch.</p>
        <p>Khoản hoàn tiền, nếu được chấp thuận, sẽ được trả về phương thức thanh toán ban đầu. Thời gian ghi có phụ thuộc vào ngân hàng hoặc tổ chức phát hành thẻ.</p>
      </InfoSection>
      <InfoSection title="4. Hỗ trợ giao dịch">
        <p>Không thực hiện lại thanh toán khi giao dịch trước đó đang chờ xác minh. Hãy lưu lại mã giao dịch và liên hệ <a className="font-semibold text-slate-950 underline underline-offset-4" href="/support">CSKH</a> để được kiểm tra.</p>
      </InfoSection>
    </PublicInfoPage>
  )
}
