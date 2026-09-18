import crypto from 'node:crypto'

export const APPROVAL_STATUSES = new Set(['pending', 'approved', 'rejected', 'superseded', 'revoked'])
const APPROVAL_TRANSITIONS = new Map([
  ['pending', new Set(['approved', 'rejected'])],
  ['approved', new Set(['superseded', 'revoked'])],
  ['rejected', new Set(['pending'])],
  ['superseded', new Set()],
  ['revoked', new Set()],
])

function digest(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24)
}

export function stableAssetId({ sourceId, url, contentHash = '' }) {
  return `af_asset_${digest([sourceId, url, contentHash].join('|'))}`
}

export function stableEvidenceId(provenance) {
  return `af_evidence_${digest([
    provenance.origin,
    provenance.sourceId,
    provenance.sourceUrl,
    provenance.snapshotHash || '',
    provenance.assetUrl || '',
    provenance.assetHash || '',
    provenance.pdfPage ?? '',
    provenance.extractionMethod || '',
    provenance.excerpt || '',
  ].join('|'))}`
}

export function validateApprovalCommand(command) {
  if (!APPROVAL_STATUSES.has(command?.status)) throw new Error(`Invalid approval status: ${command?.status}`)
  if (!command?.reviewerId || !String(command.reviewerId).trim()) throw new Error('reviewerId is required')
  if (command.note !== undefined && String(command.note).length > 2000) throw new Error('approval note is too long')
  return {
    status: command.status,
    reviewerId: String(command.reviewerId).trim(),
    reviewedAt: command.reviewedAt || new Date().toISOString(),
    note: command.note ? String(command.note).trim() : null,
  }
}

export function applyApprovalCommand(current = { status: 'pending' }, command) {
  const next = validateApprovalCommand(command)
  if (!APPROVAL_STATUSES.has(current.status)) throw new Error(`Invalid current approval status: ${current.status}`)
  if (!APPROVAL_TRANSITIONS.get(current.status)?.has(next.status)) {
    throw new Error(`Invalid approval transition: ${current.status} -> ${next.status}`)
  }
  return {
    previousStatus: current.status,
    current: {
      status: next.status,
      reviewerId: next.reviewerId,
      reviewedAt: next.reviewedAt,
      note: next.note,
      approvedBy: next.status === 'approved' ? next.reviewerId : null,
      approvedAt: next.status === 'approved' ? next.reviewedAt : null,
    },
    history: {
      fromStatus: current.status,
      toStatus: next.status,
      reviewerId: next.reviewerId,
      reviewedAt: next.reviewedAt,
      note: next.note,
    },
  }
}

export function defaultApproval(existing = null) {
  if (existing && APPROVAL_STATUSES.has(existing.status)) return {
    status: existing.status,
    reviewerId: existing.reviewerId || null,
    reviewedAt: existing.reviewedAt || null,
    note: existing.note || null,
    approvedBy: existing.approvedBy || null,
    approvedAt: existing.approvedAt || null,
  }
  return { status: 'pending', reviewerId: null, reviewedAt: null, note: null, approvedBy: null, approvedAt: null }
}
