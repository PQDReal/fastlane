import type { GuardrailDecision, SecurityAuditRecord } from './types'

const recentAuditLogs: SecurityAuditRecord[] = []
const MAX_LOGS = 200

export function recordSecurityAudit(payload: {
  conversationId: string
  clientKey: string
  decision: GuardrailDecision
  latencyMs: number
}): SecurityAuditRecord {
  // Hash/mask client key for privacy
  const clientHash = `client-${Buffer.from(payload.clientKey).toString('base64').slice(0, 12)}`

  const record: SecurityAuditRecord = {
    id: `sec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    conversationId: payload.conversationId,
    clientHash,
    action: payload.decision.action,
    reasonCode: payload.decision.reasonCode,
    riskVector: payload.decision.riskVector,
    latencyMs: payload.latencyMs,
  }

  recentAuditLogs.unshift(record)
  if (recentAuditLogs.length > MAX_LOGS) {
    recentAuditLogs.pop()
  }

  if (record.action === 'BLOCK' || record.action === 'RESTRICTED_GUARD') {
    console.warn('[SECURITY GUARDRAIL EVENT]', {
      id: record.id,
      action: record.action,
      reason: record.reasonCode,
      techniques: record.riskVector.detectedTechniques,
      latencyMs: record.latencyMs,
    })
  }

  return record
}

export function getRecentSecurityAuditLogs(): SecurityAuditRecord[] {
  return [...recentAuditLogs]
}
