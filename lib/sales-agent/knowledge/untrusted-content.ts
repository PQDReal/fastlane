import { buildDetectionViews } from '../guardrails/canonicalizer'
import { detectRisks } from '../guardrails/risk-detector'

export const BLOCKED_KNOWLEDGE_TEXT = 'Nội dung nguồn đã bị ẩn vì không vượt qua kiểm tra an toàn.'

export type GuardedKnowledgeText = {
  text: string
  blocked: boolean
}

/**
 * Knowledge and CMS fields are evidence, never instructions. High-risk text is
 * removed before it can enter either the model context or deterministic UI.
 */
export function guardUntrustedKnowledgeText(value: unknown): GuardedKnowledgeText {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return { text: '', blocked: false }

  const risks = detectRisks(buildDetectionViews(text))
  const blocked = risks.injectionRisk >= 80
    || risks.dataExfiltrationRisk >= 80
    || risks.obfuscationRisk >= 80

  return {
    text: blocked ? BLOCKED_KNOWLEDGE_TEXT : text,
    blocked,
  }
}
