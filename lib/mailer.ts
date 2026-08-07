import nodemailer from 'nodemailer'
import dns from 'dns'
import { Resend } from 'resend'

// Force IPv4 for Node.js 18+ to avoid ENETUNREACH on IPv6 networks
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first')
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/**
 * Utility for sending emails.
 * Uses Resend if RESEND_API_KEY is set.
 * Fallbacks to Nodemailer (SMTP) if SMTP_USER is set.
 */
export async function sendEmailOTP(to: string, otp: string, subject: string = 'Fastlane | Mã OTP xác thực ký hợp đồng') {
  // 1. Dùng Resend nếu có API Key
  if (resend) {
    try {
      const data = await resend.emails.send({
        from: 'VinFast Fastlane <onboarding@resend.dev>', // Resend test domain
        to: [to],
        subject,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2>Xác thực ký hợp đồng</h2>
            <p>Mã xác thực OTP của bạn là: <strong style="font-size: 24px; color: #1e4d2b;">${otp}</strong></p>
            <p>Mã này sẽ hết hạn trong vòng 5 phút.</p>
            <p>Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này.</p>
            <br/>
            <p>Trân trọng,<br/>Đội ngũ VinFast Fastlane</p>
          </div>
        `,
      });
      console.log('[RESEND] Đã gửi email thành công:', data);
      return true;
    } catch (error) {
      console.error('[RESEND ERROR]:', error);
      throw new Error('Không thể gửi email qua Resend.');
    }
  }

  // 2. Nếu chưa cấu hình gì, fallback về mock logging
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('\n=============================================')
    console.log('[MOCK EMAIL] Đang gửi email (Chưa cấu hình .env.local)...')
    console.log(`- Đến: ${to}`)
    console.log(`- Tiêu đề: ${subject}`)
    console.log(`- Nội dung: Mã xác thực OTP của bạn là: ${otp}. Mã này sẽ hết hạn trong 5 phút.`)
    console.log('=============================================\n')
    return true
  }

  // 3. Fallback dùng Nodemailer (nếu cấu hình SMTP)
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // Port 587 uses STARTTLS
    family: 4,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  } as any)

  const mailOptions = {
    from: `"VinFast Fastlane" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2>Xác thực ký hợp đồng</h2>
        <p>Mã xác thực OTP của bạn là: <strong style="font-size: 24px; color: #1e4d2b;">${otp}</strong></p>
        <p>Mã này sẽ hết hạn trong vòng 5 phút.</p>
        <p>Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này.</p>
        <br/>
        <p>Trân trọng,<br/>Đội ngũ VinFast Fastlane</p>
      </div>
    `,
  }

  try {
    await transporter.sendMail(mailOptions)
    return true
  } catch (error) {
    console.error('Error sending email:', error)
    throw new Error('Không thể gửi email OTP. Vui lòng thử lại sau.')
  }
}

/**
 * Gửi email thông báo ký hợp đồng thành công kèm link xem hợp đồng trực tuyến.
 */
export async function sendContractSignedEmail(
  to: string,
  customerName: string,
  orderNumber: string,
  contractDate: string,
  productName: string,
  depositAmount: string,
  remainingAmount: string,
  orderId: string
) {
  const subject = 'VinFast Fastlane | Hợp đồng đã ký thành công'
  
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: 'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; margin: 0; padding: 0; }
  .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); }
  .header { background-color: #1e4d2b; padding: 30px 40px; text-align: center; color: #ffffff; }
  .header h1 { margin: 0; font-size: 24px; font-weight: 600; letter-spacing: 1px; }
  .header p { margin: 10px 0 0 0; font-size: 14px; opacity: 0.9; text-transform: uppercase; letter-spacing: 1px; }
  .content { padding: 40px; }
  .greeting { font-size: 18px; color: #333; margin-bottom: 20px; }
  .message { font-size: 15px; color: #555; line-height: 1.6; margin-bottom: 30px; }
  .details-box { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 25px; margin-bottom: 30px; }
  .details-title { font-size: 13px; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 15px; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;}
  .detail-row { display: flex; justify-content: space-between; margin-bottom: 12px; }
  .detail-row:last-child { margin-bottom: 0; }
  .detail-label { color: #64748b; font-size: 14px; }
  .detail-value { color: #0f172a; font-size: 14px; font-weight: 600; text-align: right; }
  .action-box { text-align: center; margin-top: 40px; margin-bottom: 10px; }
  .btn { display: inline-block; background-color: #1e4d2b; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px; transition: background-color 0.3s; }
  .btn:hover { background-color: #15381f; }
  .footer { background-color: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #64748b; }
  .alert { background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; border-radius: 4px; margin-bottom: 30px; font-size: 14px; color: #1e3a8a; line-height: 1.5; }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>VINFAST FASTLANE</h1>
      <p>Xác nhận hợp đồng thành công</p>
    </div>
    <div class="content">
      <div class="greeting">Kính gửi Quý khách <strong>${customerName}</strong>,</div>
      
      <div class="alert">
        <strong>Thành công!</strong> Hợp đồng đặt cọc xe VinFast của Quý khách đã được ký điện tử thành công và chính thức có hiệu lực.
      </div>
      
      <div class="message">
        Cảm ơn Quý khách đã tin tưởng và lựa chọn đồng hành cùng VinFast. Dưới đây là thông tin tóm tắt về hợp đồng của Quý khách. Quý khách có thể xem và tải về toàn văn hợp đồng có chữ ký điện tử bằng cách nhấn vào nút bên dưới.
      </div>
      
      <div class="details-box">
        <div class="details-title">Thông tin Hợp đồng</div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
          <span class="detail-label">Mã hợp đồng:</span>
          <span class="detail-value" style="color: #1e4d2b;">${orderNumber}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
          <span class="detail-label">Ngày ký kết:</span>
          <span class="detail-value">${contractDate}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span class="detail-label">Trạng thái:</span>
          <span class="detail-value" style="color: #059669;">Đã ký điện tử hợp lệ</span>
        </div>
      </div>
      
      <div class="details-box">
        <div class="details-title">Thông tin Sản phẩm</div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
          <span class="detail-label">Mẫu xe:</span>
          <span class="detail-value">${productName}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
          <span class="detail-label">Số tiền đặt cọc:</span>
          <span class="detail-value" style="color: #b91c1c;">${depositAmount}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span class="detail-label">Số tiền còn lại cần thanh toán:</span>
          <span class="detail-value" style="color: #ea580c;">${remainingAmount}</span>
        </div>
      </div>
      
      <div class="action-box">
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/profile/contract/${orderId}" class="btn">Xem & Tải Hợp Đồng</a>
      </div>
    </div>
    <div class="footer">
      <p>Email này được tạo tự động từ hệ thống VinFast Fastlane. Vui lòng không trả lời trực tiếp email này.</p>
      <p>© 2026 VinFast Auto. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `


  if (resend) {
    try {
      const data = await resend.emails.send({
        from: 'VinFast Fastlane <onboarding@resend.dev>',
        to: [to],
        subject,
        html: htmlContent,
      });
      console.log('[RESEND] Đã gửi email hợp đồng thành công:', data);
      return true;
    } catch (error) {
      console.error('[RESEND ERROR]:', error);
      throw new Error('Không thể gửi email qua Resend.');
    }
  }

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('\n=============================================')
    console.log('[MOCK EMAIL] Đang gửi email Hợp đồng (Chưa cấu hình .env.local)...')
    console.log(`- Đến: ${to}`)
    console.log(`- Tiêu đề: ${subject}`)
    console.log(`- Nội dung: Email chứa link xem hợp đồng`)
    console.log('=============================================\n')
    return true
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    family: 4,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  } as any)

  const mailOptions = {
    from: `"VinFast Fastlane" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html: htmlContent,
  }

  try {
    await transporter.sendMail(mailOptions)
    return true
  } catch (error) {
    console.error('Error sending contract email:', error)
    throw new Error('Không thể gửi email hợp đồng. Vui lòng thử lại sau.')
  }
}

