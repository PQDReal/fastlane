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
export async function sendEmailOTP(to: string, otp: string, subject: string = 'Mã xác thực OTP hợp đồng') {
  const htmlTemplate = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    /* Mso normalizer cho Outlook */
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
              <img src="https://i.ibb.co/27Xy5yRX/fastlane-logo-name.png" alt="FASTLANE" height="64" style="display: block; margin: 0 auto; border: 0;" />
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 40px; color: #334155;">
              <h2 style="margin-top: 0; color: #1e293b; font-size: 20px; font-weight: 600;">Xác thực ký hợp đồng</h2>
              <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">Xin chào,</p>
              <p style="font-size: 16px; line-height: 1.6; margin-bottom: 30px;">Bạn đang thực hiện thao tác ký hợp đồng trên hệ thống Fastlane. Vui lòng sử dụng mã xác thực (OTP) dưới đây để hoàn tất thủ tục:</p>
              
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 20px; text-align: center; margin-bottom: 30px;">
                <span style="font-family: monospace; font-size: 36px; font-weight: 700; color: #2563eb; letter-spacing: 12px; margin-left: 12px;">${otp}</span>
              </div>
              
              <p style="font-size: 14px; color: #64748b; line-height: 1.5; margin-bottom: 24px;">
                <strong style="color: #ef4444;">Lưu ý:</strong> Mã này sẽ hết hạn trong vòng <strong>5 phút</strong>. Tuyệt đối không chia sẻ mã này cho bất kỳ ai.
              </p>
              <p style="font-size: 16px; line-height: 1.6; margin-bottom: 0;">Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email hoặc liên hệ với bộ phận hỗ trợ.</p>
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

  // 1. Dùng Resend nếu có API Key
  if (resend) {
    try {
      const data = await resend.emails.send({
        from: process.env.OTP_EMAIL_FROM || 'Fastlane <no-reply@loobycard.com>',
        to: [to],
        subject,
        html: htmlTemplate,
      });
      if (data.error) throw new Error(data.error.message)
      return true;
    } catch (error) {
      console.error('[RESEND ERROR]:', error);
      throw new Error('Không thể gửi email qua Resend.');
    }
  }

  // Explicit local-only fallback for developers without an email provider.
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    if (process.env.NODE_ENV !== 'production' && process.env.ENABLE_OTP_EMAIL_LOGGING === 'true') {
      console.info(`[contract-otp:local] ${to} ${subject}: ${otp}`)
      return true
    }
    throw new Error('OTP_EMAIL_PROVIDER_NOT_CONFIGURED')
  }

  // Fallback to SMTP when configured.
  const smtpHost = process.env.SMTP_HOST?.trim() || 'smtp.gmail.com';
  const smtpPort = Number(process.env.SMTP_PORT || 465)
  let resolvedHost = smtpHost;
  try {
    const { address } = await dns.promises.lookup(smtpHost, { family: 4 });
    if (address) resolvedHost = address;
  } catch (e) {
    console.error('DNS lookup failed for IPv4, using default host', e);
  }

  const transporter = nodemailer.createTransport({
    host: resolvedHost,
    port: Number.isInteger(smtpPort) && smtpPort > 0 ? smtpPort : 465,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : smtpPort === 465,
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
  }

  try {
    await transporter.sendMail(mailOptions)
    return true
  } catch (error: any) {
    console.error('Error sending email:', error)
    throw new Error('Không thể gửi email OTP: ' + (error?.message || 'Unknown error'))
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
              <img src="https://i.ibb.co/27Xy5yRX/fastlane-logo-name.png" alt="FASTLANE" height="64" style="display: block; margin: 0 auto; border: 0;" />
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
