import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const ENVELOPE_VERSION = 1

export type EncryptedDepositDraft = {
  version: typeof ENVELOPE_VERSION
  iv: string
  tag: string
  ciphertext: string
}

function keyFromSecret(secret: string) {
  if (secret.trim().length < 32) {
    throw new Error('Deposit draft encryption secret must contain at least 32 characters')
  }
  return createHash('sha256')
    .update('fastlane:deposit-draft:encryption:v1\0')
    .update(secret)
    .digest()
}

function additionalData(owner: string) {
  return Buffer.from(`fastlane:deposit-draft:v1:${owner}`, 'utf8')
}

export function encryptDepositDraft(
  value: unknown,
  secret: string,
  owner: string,
): EncryptedDepositDraft {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, keyFromSecret(secret), iv)
  cipher.setAAD(additionalData(owner))
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ])

  return {
    version: ENVELOPE_VERSION,
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  }
}

export function decryptDepositDraft<T>(
  envelope: EncryptedDepositDraft,
  secret: string,
  owner: string,
): T {
  if (envelope.version !== ENVELOPE_VERSION) {
    throw new Error('Unsupported deposit draft encryption version')
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    keyFromSecret(secret),
    Buffer.from(envelope.iv, 'base64url'),
  )
  decipher.setAAD(additionalData(owner))
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64url')),
    decipher.final(),
  ])
  return JSON.parse(plaintext.toString('utf8')) as T
}
