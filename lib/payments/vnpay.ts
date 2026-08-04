import crypto from 'node:crypto'

export type VnPayParams = Record<string, string>
const SANDBOX_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'

export class VnPayConfigError extends Error {
  constructor() {
    super('Cổng thanh toán VNPAY chưa được cấu hình.')
    this.name = 'VnPayConfigError'
  }
}

export function vnPayConfig() {
  const baseUrl = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
  const tmnCode = process.env.VNPAY_TMN_CODE?.trim()
  const hashSecret = process.env.VNPAY_HASH_SECRET?.trim()
  if (!tmnCode || !hashSecret) throw new VnPayConfigError()
  return {
    paymentUrl: process.env.VNPAY_PAYMENT_URL || SANDBOX_URL,
    tmnCode,
    hashSecret,
    returnUrl: process.env.VNPAY_RETURN_URL || `${baseUrl}/payment/vnpay/return`,
  }
}

const encode = (value: string) => encodeURIComponent(value).replace(/%20/g, '+')

export function vnPaySigningData(params: VnPayParams) {
  return Object.entries(params)
    .filter(([key, value]) => value !== '' && key !== 'vnp_SecureHash' && key !== 'vnp_SecureHashType')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encode(key)}=${encode(value)}`)
    .join('&')
}

export function createVnPayHash(params: VnPayParams, secret = vnPayConfig().hashSecret) {
  return crypto.createHmac('sha512', secret).update(vnPaySigningData(params), 'utf8').digest('hex')
}

export function verifyVnPayHash(params: VnPayParams, secret = vnPayConfig().hashSecret) {
  const received = params.vnp_SecureHash?.toLowerCase()
  if (!received || !/^[a-f0-9]{128}$/.test(received)) return false
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(createVnPayHash(params, secret), 'hex'))
}

function vnDate(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || ''
  return `${part('year')}${part('month')}${part('day')}${part('hour')}${part('minute')}${part('second')}`
}

export function createVnPayPaymentUrl(input: {
  transactionReference: string
  orderNumber: string
  amountVnd: number
  clientIp: string
  now?: Date
}) {
  const config = vnPayConfig()
  const now = input.now || new Date()
  const params: VnPayParams = {
    vnp_Version: '2.1.0', vnp_Command: 'pay', vnp_TmnCode: config.tmnCode,
    vnp_Amount: String(Math.round(input.amountVnd * 100)), vnp_CurrCode: 'VND',
    vnp_TxnRef: input.transactionReference,
    vnp_OrderInfo: `Thanh toan dat coc ${input.orderNumber}`,
    vnp_OrderType: 'other', vnp_Locale: 'vn', vnp_ReturnUrl: config.returnUrl,
    vnp_IpAddr: input.clientIp === '::1' ? '127.0.0.1' : input.clientIp,
    vnp_CreateDate: vnDate(now), vnp_ExpireDate: vnDate(new Date(now.getTime() + 15 * 60_000)),
  }
  const signingData = vnPaySigningData(params)
  return `${config.paymentUrl}?${signingData}&vnp_SecureHash=${createVnPayHash(params, config.hashSecret)}`
}

export const vnPayParams = (searchParams: URLSearchParams): VnPayParams =>
  Object.fromEntries(searchParams.entries())
