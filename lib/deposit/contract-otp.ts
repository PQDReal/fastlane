import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'

const OTP_PATTERN = /^\d{6}$/
const MIN_SECRET_LENGTH = 32
const OTP_MAX_AGE_MS = 5 * 60 * 1000
const OTP_CLOCK_SKEW_MS = 60 * 1000

export type ContractOtpBinding = {
  customerId: string
  orderId: string
  documentId: string
  contentHash: string
}

export type ContractOtpRecord = ContractOtpBinding & {
  version: 1
  digest: string
  issuedAt: string
}

type SecretEnvironment = {
  CONTRACT_OTP_SECRET?: string
  AUTH0_SECRET?: string
}

export function resolveContractOtpSecret(env: SecretEnvironment = process.env as SecretEnvironment) {
  const value = env.CONTRACT_OTP_SECRET?.trim() || env.AUTH0_SECRET?.trim() || ''
  return value.length >= MIN_SECRET_LENGTH ? value : null
}

export function createContractOtpCode() {
  return randomInt(100_000, 1_000_000).toString()
}

function otpDigest(binding: ContractOtpBinding, otp: string, issuedAt: string, secret: string) {
  return createHmac('sha256', secret)
    .update('fastlane:contract-sign-otp:v1\n')
    .update(binding.customerId)
    .update('\n')
    .update(binding.orderId)
    .update('\n')
    .update(binding.documentId)
    .update('\n')
    .update(binding.contentHash)
    .update('\n')
    .update(issuedAt)
    .update('\n')
    .update(otp)
    .digest('hex')
}

export function createContractOtpRecord(
  binding: ContractOtpBinding,
  otp: string,
  secret: string,
  now = new Date(),
): ContractOtpRecord {
  if (!OTP_PATTERN.test(otp)) throw new Error('CONTRACT_OTP_INVALID')
  const issuedAt = now.toISOString()
  return {
    version: 1,
    ...binding,
    digest: otpDigest(binding, otp, issuedAt, secret),
    issuedAt,
  }
}

export function verifyContractOtpRecord(
  record: ContractOtpRecord,
  binding: ContractOtpBinding,
  otp: string,
  secret: string,
  now = new Date(),
) {
  if (record.version !== 1 || !OTP_PATTERN.test(otp)) return false
  if (
    record.customerId !== binding.customerId
    || record.orderId !== binding.orderId
    || record.documentId !== binding.documentId
    || record.contentHash !== binding.contentHash
  ) return false
  const issuedAt = Date.parse(record.issuedAt)
  const nowTime = now.getTime()
  if (!Number.isFinite(issuedAt) || issuedAt > nowTime + OTP_CLOCK_SKEW_MS || nowTime - issuedAt > OTP_MAX_AGE_MS) {
    return false
  }

  const expected = Buffer.from(otpDigest(binding, otp, record.issuedAt, secret), 'hex')
  const actual = Buffer.from(record.digest, 'hex')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export function contractOtpKey(binding: ContractOtpBinding) {
  return `fastlane:contract-sign-otp:${binding.customerId}:${binding.orderId}:${binding.documentId}`
}

export function contractOtpAttemptKey(binding: ContractOtpBinding) {
  return `${contractOtpKey(binding)}:attempts`
}

export function contractOtpCooldownKey(binding: ContractOtpBinding) {
  return `${contractOtpKey(binding)}:cooldown`
}

export function contractOtpHourlyLimitKey(binding: ContractOtpBinding) {
  return `fastlane:contract-sign-otp:${binding.customerId}:${binding.orderId}:hourly`
}
