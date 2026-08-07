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
      pass: process.env.SMTP_PASS?.replace(/\s+/g, ''),
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
  } catch (error: any) {
    console.error('Error sending email:', error)
    throw new Error('Không thể gửi email OTP: ' + (error?.message || 'Unknown error'))
  }
}
