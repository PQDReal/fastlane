import 'server-only'

import { depositDraftCacheKey } from '@/lib/cache-keys'
import {
  decryptDepositDraft,
  encryptDepositDraft,
  type EncryptedDepositDraft,
} from '@/lib/deposit/draft-crypto'
import {
  parseDepositDraft,
  type DepositDraft,
  type StoredDepositDraft,
} from '@/lib/deposit/draft'
import { deleteRedisKey, readRedisJson, writeRedisJson } from '@/lib/redis'

export const DEPOSIT_DRAFT_TTL_SECONDS = 24 * 60 * 60

function encryptionSecret() {
  const secret =
    process.env.DEPOSIT_DRAFT_ENCRYPTION_KEY?.trim()
    || process.env.AUTH0_SECRET?.trim()
  if (!secret) {
    throw new Error('Missing DEPOSIT_DRAFT_ENCRYPTION_KEY or AUTH0_SECRET')
  }
  return secret
}

export async function readDepositDraft(owner: string) {
  const key = depositDraftCacheKey(owner)
  const envelope = await readRedisJson<EncryptedDepositDraft>(key)
  if (!envelope) return null

  try {
    const decrypted = decryptDepositDraft<StoredDepositDraft>(
      envelope,
      encryptionSecret(),
      owner,
    )
    return {
      ...parseDepositDraft(decrypted),
      savedAt: decrypted.savedAt,
    } satisfies StoredDepositDraft
  } catch {
    // A corrupted, expired-key or cross-account payload must never be exposed.
    await deleteRedisKey(key)
    return null
  }
}

export async function saveDepositDraft(owner: string, draft: DepositDraft) {
  const stored: StoredDepositDraft = {
    ...parseDepositDraft(draft),
    savedAt: new Date().toISOString(),
  }
  const envelope = encryptDepositDraft(stored, encryptionSecret(), owner)
  const saved = await writeRedisJson(
    depositDraftCacheKey(owner),
    envelope,
    DEPOSIT_DRAFT_TTL_SECONDS,
  )
  return saved ? stored : null
}

export async function deleteDepositDraft(owner: string) {
  return deleteRedisKey(depositDraftCacheKey(owner))
}
