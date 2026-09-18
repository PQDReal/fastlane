import { buildDetectionViews } from './canonicalizer'
import { detectRisks } from './risk-detector'
import { evaluatePolicy } from './policy-engine'
import { recordSecurityAudit } from './audit-logger'
import { sanitizeOutputText } from './output-guard'
import { checkRateLimit } from './rate-limiter'
import type { GuardrailDecision, RateLimitResult } from './types'

export * from './types'
export * from './canonicalizer'
export * from './risk-detector'
export * from './policy-engine'
export * from './output-guard'
export * from './rate-limiter'
export * from './audit-logger'

export function evaluateInputGuardrails(
  input: string,
  context?: { conversationId?: string; clientKey?: string },
): GuardrailDecision {
  const startTime = Date.now()
  const views = buildDetectionViews(input)
  const risks = detectRisks(views)
  const decision = evaluatePolicy(risks)
  const latencyMs = Date.now() - startTime

  recordSecurityAudit({
    conversationId: context?.conversationId || 'anon',
    clientKey: context?.clientKey || 'unknown',
    decision,
    latencyMs,
  })

  return decision
}

export function evaluateOutputGuardrails(text: string): { sanitized: string; redactedCount: number; solicitedPii: boolean } {
  return sanitizeOutputText(text)
}

export function evaluateRateLimit(clientKey: string): RateLimitResult {
  return checkRateLimit(clientKey)
}
