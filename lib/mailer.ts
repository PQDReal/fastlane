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
  const htmlTemplate = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f7f6; font-family: Inter, Arial, sans-serif; color: #334155;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; background-color: #f4f7f6;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 600px; overflow: hidden; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);">
          <tr>
            <td align="center" style="padding: 34px 40px 24px; border-bottom: 1px solid #f1f5f9;">
              <img src="https://res.cloudinary.com/dawbec7mw/image/upload/v1787196680/fastlane/vmeey4jjnztproaj22ax.png" alt="FASTLANE" height="56" style="display: block; height: 56px; width: auto; border: 0;">
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 40px 32px;">
              <p style="margin: 0 0 10px; color: #9b7200; font-size: 12px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase;">Xác thực tài liệu</p>
              <h1 style="margin: 0 0 18px; color: #0f172a; font-size: 24px; line-height: 1.35; font-weight: 700;">Mã xác thực của bạn</h1>
              <p style="margin: 0 0 26px; color: #475569; font-size: 15px; line-height: 1.7;">Bạn đang thực hiện xác nhận tài liệu mua xe trên hệ thống Fastlane. Vui lòng sử dụng mã gồm 6 chữ số dưới đây để hoàn tất thao tác.</p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center" style="padding: 22px 16px; border: 1px solid #f5d77a; border-radius: 10px; background-color: #fffbeb;">
                    <p style="margin: 0 0 8px; color: #78600c; font-size: 12px; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase;">Mã OTP</p>
                    <p style="margin: 0; color: #1e4d2b; font-family: 'Courier New', monospace; font-size: 36px; font-weight: 700; line-height: 1.2; letter-spacing: 10px;">${otp}</p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 14px 16px; border-left: 4px solid #e19200; border-radius: 6px; background-color: #fff8e7; color: #6b5300; font-size: 14px; line-height: 1.6;">
                    <strong>Mã có hiệu lực trong 5 phút.</strong> Vui lòng không chia sẻ mã này với bất kỳ ai, kể cả nhân viên hỗ trợ.
                  </td>
                </tr>
              </table>

              <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.65;">Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email. Tài liệu sẽ không được xác nhận nếu không nhập đúng mã OTP.</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 20px 40px; border-top: 1px solid #e2e8f0; background-color: #f8fafc;">
              <p style="margin: 0 0 4px; color: #64748b; font-size: 13px; line-height: 1.5;">Trân trọng,</p>
              <p style="margin: 0; color: #334155; font-size: 13px; font-weight: 700; line-height: 1.5;">Đội ngũ Fastlane</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
  const textTemplate = `Mã xác thực Fastlane của bạn là: ${otp}. Mã có hiệu lực trong 5 phút. Không chia sẻ mã này với bất kỳ ai.`

  // 1. Dùng Resend nếu có API Key
  if (resend) {
    try {
      const data = await resend.emails.send({
        from: process.env.OTP_EMAIL_FROM || 'Fastlane <no-reply@loobycard.com>',
        to: [to],
        subject,
        html: htmlTemplate,
        text: textTemplate,
      });
      if (data.error) throw new Error(data.error.message)
      console.log('[RESEND] Đã gửi email thành công:', data);
      return true;
    } catch (error) {
      console.error('[RESEND ERROR]:', error);
      throw new Error('Không thể gửi email qua Resend.');
    }
  }

  // 2. Nếu chưa cấu hình gì, fallback về mock logging
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    if (process.env.NODE_ENV !== 'production' && process.env.ENABLE_OTP_EMAIL_LOGGING === 'true') {
      console.info(`[contract-otp:local] ${to} ${subject}: ${otp}`)
      return true
    }
    throw new Error('OTP_EMAIL_PROVIDER_NOT_CONFIGURED')
  }

  // 3. Fallback dùng Nodemailer (nếu cấu hình SMTP)
  const smtpHost = 'smtp.gmail.com';
  let resolvedHost = smtpHost;
  try {
    const { address } = await dns.promises.lookup(smtpHost, { family: 4 });
    if (address) resolvedHost = address;
  } catch (e) {
    console.error('DNS lookup failed for IPv4, using default host', e);
  }

  const transporter = nodemailer.createTransport({
    host: resolvedHost,
    port: 587,
    secure: false, // Port 587 uses STARTTLS
    tls: {
      servername: smtpHost,
    },
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS?.replace(/\s+/g, ''),
    },
  } as any)

  const mailOptions = {
    from: process.env.OTP_EMAIL_FROM || `"Fastlane" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html: htmlTemplate,
    text: textTemplate,
  }

  try {
    await transporter.sendMail(mailOptions)
    return true
  } catch (error: any) {
    console.error('Error sending email via SMTP:', error)
    throw new Error('Không thể gửi email OTP: ' + (error?.message || 'Unknown error'))
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
  const subject = 'Fastlane | Hợp đồng đã ký thành công'
  const displayProductName = productName.replace(/vinfast/gi, '').replace(/\s+/g, ' ').trim() || 'Xe điện'
  
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: 'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; margin: 0; padding: 0; }
  .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); }
  .header { background-color: #ffffff; padding: 34px 40px 24px; text-align: center; border-bottom: 1px solid #f1f5f9; }
  .content { padding: 40px; }
  .eyebrow { margin: 0 0 10px; color: #9b7200; font-size: 12px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; }
  .title { margin: 0 0 24px; color: #0f172a; font-size: 24px; line-height: 1.35; font-weight: 700; }
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
      <img src="https://res.cloudinary.com/dawbec7mw/image/upload/v1787196680/fastlane/vmeey4jjnztproaj22ax.png" alt="FASTLANE" height="56" style="display: block; height: 56px; width: auto; margin: 0 auto; border: 0;">
    </div>
    <div class="content">
      <div class="eyebrow">Xác nhận hợp đồng</div>
      <h1 class="title">Hợp đồng đã ký thành công</h1>
      <div class="greeting">Kính gửi Quý khách <strong>${customerName}</strong>,</div>
      
      <div class="alert">
        <strong>Thành công!</strong> Hợp đồng mua xe của Quý khách đã được ký điện tử thành công và chính thức có hiệu lực.
      </div>
      
      <div class="message">
        Cảm ơn Quý khách đã tin tưởng và lựa chọn đồng hành cùng Fastlane. Dưới đây là thông tin tóm tắt về hợp đồng của Quý khách. Quý khách có thể xem và tải về toàn văn hợp đồng có chữ ký điện tử bằng cách nhấn vào nút bên dưới.
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
          <span class="detail-value">${displayProductName}</span>
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
      <p>Email này được tạo tự động từ hệ thống Fastlane. Vui lòng không trả lời trực tiếp email này.</p>
      <p>© 2026 Fastlane. Mọi quyền được bảo lưu.</p>
    </div>
  </div>
</body>
</html>
  `


  if (resend) {
    try {
      const data = await resend.emails.send({
        from: process.env.OTP_EMAIL_FROM || 'Fastlane <no-reply@loobycard.com>',
        to: [to],
        subject,
        html: htmlContent,
      });
      if (data.error) throw new Error(data.error.message)
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
    from: process.env.OTP_EMAIL_FROM || `"Fastlane" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html: htmlContent,
  }

  try {
    await transporter.sendMail(mailOptions)
    return true
  } catch (error: any) {
    console.error('Error sending contract email via SMTP:', error)
    // Graceful fallback for local development if network blocks SMTP ports
    if (process.env.NODE_ENV !== 'production' || process.env.APP_BASE_URL?.includes('localhost')) {
      console.log('\n=============================================')
      console.log('[FALLBACK EMAIL] Gửi email hợp đồng qua SMTP thất bại do mạng chặn cổng. Xem thông tin hợp đồng bên dưới:')
      console.log(`- Đến: ${to}`)
      console.log(`- Tiêu đề: ${subject}`)
      console.log(`- Link xem hợp đồng: ${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/profile/contract/${orderId}`)
      console.log('=============================================\n')
      return true
    }
    throw new Error('Không thể gửi email hợp đồng. Vui lòng thử lại sau.')
  }
}

export async function sendPaymentSuccessEmail(to: string, orderNumber: string, amountVnd: number) {
  const amountFormatted = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amountVnd);
  const subject = `Xác nhận đặt cọc thành công - Đơn hàng ${orderNumber}`;
  const htmlTemplate = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    table, td, div, h1, p {font-family: 'Inter', Arial, sans-serif !important;}
  </style>
</head>
<body style="font-family: 'Inter', Arial, sans-serif; background-color: #f4f7f6; margin: 0; padding: 40px 0;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f7f6;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
          <!-- Header -->
          <tr>
            <td style="background-color: #ffffff; padding: 40px 40px 10px 40px; text-align: center;">
              <img src="https://res.cloudinary.com/dawbec7mw/image/upload/v1787196680/fastlane/vmeey4jjnztproaj22ax.png" alt="FASTLANE" height="64" style="display: block; margin: 0 auto; border: 0;" />
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 40px; color: #334155;">
              <h2 style="margin-top: 0; color: #1e293b; font-size: 20px; font-weight: 600; color: #16a34a;">Đặt cọc thành công!</h2>
              <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">Xin chào,</p>
              <p style="font-size: 16px; line-height: 1.6; margin-bottom: 30px;">Cảm ơn bạn đã tin tưởng và đặt cọc tại Fastlane. Chúng tôi xin xác nhận thanh toán của bạn đã được ghi nhận thành công.</p>
              
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 20px; margin-bottom: 30px;">
                <p style="margin: 0 0 10px 0; font-size: 15px;">Mã đơn hàng: <strong style="color: #0f172a;">${orderNumber}</strong></p>
                <p style="margin: 0; font-size: 15px;">Số tiền đã thanh toán: <strong style="color: #2563eb;">${amountFormatted}</strong></p>
              </div>
              
              <p style="font-size: 15px; color: #475569; line-height: 1.6; margin-bottom: 0;">Đội ngũ chăm sóc khách hàng của Fastlane sẽ sớm liên hệ với bạn để hướng dẫn các bước tiếp theo.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 14px; color: #94a3b8;">
                Trân trọng,<br>
                <strong>Đội ngũ Fastlane</strong>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  if (resend) {
    try {
      const data = await resend.emails.send({
        from: 'Fastlane <no-reply@loobycard.com>',
        to: [to],
        subject,
        html: htmlTemplate,
      });
      console.log('[RESEND] Đã gửi email thanh toán thành công:', data);
      return true;
    } catch (error) {
      console.error('[RESEND ERROR]:', error);
      // Don't throw error to avoid failing the IPN webhook
      return false;
    }
  }

  console.log('\n=============================================')
  console.log('[MOCK EMAIL] Đang gửi email xác nhận đặt cọc...')
  console.log(`- Đến: ${to}`)
  console.log(`- Tiêu đề: ${subject}`)
  console.log(`- Đơn hàng: ${orderNumber}, Số tiền: ${amountFormatted}`)
  console.log('=============================================\n')
  return true;
}

export async function sendTestDriveConfirmationEmail(
  to: string,
  data: { fullName: string; productName: string; scheduledAt: string; referenceNumber: string }
) {
  const scheduledDate = new Date(data.scheduledAt);
  const formattedDate = new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(scheduledDate);

  const subject = `Xác nhận lịch hẹn lái thử - Mã ${data.referenceNumber}`;
  const htmlTemplate = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    table, td, div, h1, p {font-family: 'Inter', Arial, sans-serif !important;}
  </style>
</head>
<body style="font-family: 'Inter', Arial, sans-serif; background-color: #f4f7f6; margin: 0; padding: 40px 0;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f7f6;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
          <!-- Header -->
          <tr>
            <td style="background-color: #ffffff; padding: 40px 40px 10px 40px; text-align: center;">
              <img src="https://res.cloudinary.com/dawbec7mw/image/upload/v1787196680/fastlane/vmeey4jjnztproaj22ax.png" alt="FASTLANE" height="64" style="display: block; margin: 0 auto; border: 0;" />
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 40px; color: #334155;">
              <h2 style="margin-top: 0; color: #1e293b; font-size: 20px; font-weight: 600; color: #16a34a;">Đặt lịch thành công!</h2>
              <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">Xin chào <strong style="color: #0f172a;">${data.fullName}</strong>,</p>
              <p style="font-size: 16px; line-height: 1.6; margin-bottom: 30px;">Cảm ơn bạn đã đăng ký lái thử tại Fastlane. Lịch hẹn của bạn đã được ghi nhận trên hệ thống với thông tin như sau:</p>
              
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 20px; margin-bottom: 30px;">
                <p style="margin: 0 0 10px 0; font-size: 15px;">Mã lịch hẹn: <strong style="color: #0f172a;">${data.referenceNumber}</strong></p>
                <p style="margin: 0 0 10px 0; font-size: 15px;">Mẫu xe lái thử: <strong style="color: #2563eb;">${data.productName}</strong></p>
                <p style="margin: 0; font-size: 15px;">Thời gian dự kiến: <strong style="color: #ea580c;">${formattedDate}</strong></p>
              </div>
              
              <p style="font-size: 15px; color: #475569; line-height: 1.6; margin-bottom: 20px;">
                <strong>Lưu ý quan trọng:</strong> Vui lòng mang theo <strong>CMND/CCCD</strong> và <strong>Bằng lái xe hợp lệ B1/B2</strong> khi đến showroom để hoàn thiện thủ tục lái thử.
              </p>
              
              <p style="font-size: 15px; color: #475569; line-height: 1.6; margin-bottom: 0;">Đội ngũ tư vấn viên của chúng tôi sẽ sớm liên hệ qua điện thoại để xác nhận lại lịch trình.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 14px; color: #94a3b8;">
                Trân trọng,<br>
                <strong>Đội ngũ Fastlane</strong>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  if (resend) {
    try {
      const resp = await resend.emails.send({
        from: 'Fastlane <no-reply@loobycard.com>',
        to: [to],
        subject,
        html: htmlTemplate,
      });
      console.log('[RESEND] Đã gửi email lịch lái thử:', resp);
      return true;
    } catch (error) {
      console.error('[RESEND ERROR]:', error);
      return false;
    }
  }

  console.log('\n=============================================')
  console.log('[MOCK EMAIL] Đang gửi email xác nhận lịch lái thử...')
  console.log(`- Đến: ${to}`)
  console.log(`- Tiêu đề: ${subject}`)
  console.log(`- Xe: ${data.productName} | Lịch: ${formattedDate}`)
  console.log('=============================================\n')
  return true;
}
