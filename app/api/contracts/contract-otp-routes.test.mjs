import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sendSource = readFileSync(new URL('./send-otp/route.ts', import.meta.url), 'utf8')
const signSource = readFileSync(new URL('./sign/route.ts', import.meta.url), 'utf8')
const clientSource = readFileSync(new URL('../../profile/contract/[orderId]/contract-client.tsx', import.meta.url), 'utf8')
const mailerSource = readFileSync(new URL('../../../lib/mailer.ts', import.meta.url), 'utf8')
const otpMailerSource = mailerSource.slice(
  mailerSource.indexOf('export async function sendEmailOTP'),
  mailerSource.indexOf('export async function sendContractSignedEmail'),
)
const viewerSource = readFileSync(new URL('../../../components/deposit/contract-viewer.tsx', import.meta.url), 'utf8')

describe('contract OTP route boundaries', () => {
  it('binds OTP issuance to the owner and active document version', () => {
    expect(sendSource).toContain('isSameDepositOwnerEmail(order.email, user.email)')
    expect(sendSource).toContain("order.status !== 'PENDING_CONTRACT'")
    expect(sendSource).toContain("document.status !== 'PENDING_SIGNATURE'")
    expect(sendSource).toContain('document.content_hash !== expectedContentHash')
    expect(sendSource).toContain('writeRedisJsonIfAbsent')
    expect(sendSource).toContain('incrementRedisCounter')
    expect(sendSource).not.toContain('Math.random')
    expect(sendSource).not.toContain('details:')
  })

  it('verifies OTP before the document-backed signing RPC and consumes it afterward', () => {
    const verifyAt = signSource.indexOf('verifyContractOtpRecord')
    const commandAt = signSource.indexOf("rpc('sign_deposit_order_contract'")
    const consumeAt = signSource.indexOf('await Promise.all([deleteRedisKey(otpKey), deleteRedisKey(attemptKey)])')
    expect(verifyAt).toBeGreaterThan(-1)
    expect(commandAt).toBeGreaterThan(verifyAt)
    expect(consumeAt).toBeGreaterThan(commandAt)
    expect(signSource).not.toContain('Bypassing OTP')
    expect(signSource).not.toContain("process.env.NODE_ENV === 'development'")
  })

  it('sends order, document and content hash from the client', () => {
    expect(clientSource).toContain('documentId: order.contractDocumentId')
    expect(clientSource).toContain('expectedContentHash: order.contractContentHash')
    expect(clientSource).toContain('otp,')
  })

  it('allows console OTP output only through an explicit non-production flag', () => {
    expect(mailerSource).toContain("process.env.NODE_ENV !== 'production'")
    expect(mailerSource).toContain("process.env.ENABLE_OTP_EMAIL_LOGGING === 'true'")
    expect(mailerSource).toContain("throw new Error('OTP_EMAIL_PROVIDER_NOT_CONFIGURED')")
  })

  it('uses the branded OTP email template for both email providers', () => {
    expect(otpMailerSource).toContain('alt="FASTLANE"')
    expect(otpMailerSource).toContain('Mã xác thực của bạn')
    expect(otpMailerSource).toContain('<strong>Mã có hiệu lực trong 5 phút.</strong>')
    expect(otpMailerSource.match(/html: htmlTemplate/g)).toHaveLength(2)
    expect(otpMailerSource.match(/text: textTemplate/g)).toHaveLength(2)
  })

  it('keeps the OTP dialog open and gates resend behind the one-minute cooldown', () => {
    expect(viewerSource).not.toContain('event.target === event.currentTarget && !isVerifying')
    expect(viewerSource).toContain('event.preventDefault()')
    expect(viewerSource).toContain('event.stopPropagation()')
    expect(viewerSource).toContain("title: 'Đóng màn hình nhập OTP?'")
    expect(viewerSource).toContain("label: 'Tiếp tục nhập'")
    expect(viewerSource).toContain("label: 'Đóng màn hình'")
    expect(viewerSource).toContain('setResendAvailableAt(Date.now() + 60_000)')
    expect(viewerSource).toContain('disabled={!onResend || resendSeconds > 0 || isResending || isVerifying}')
    expect(viewerSource).toContain('onResend={onSendOtp}')
  })
})
