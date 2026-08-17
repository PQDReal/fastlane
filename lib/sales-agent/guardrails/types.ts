export type RiskVector = {
  injectionRisk: number // 0..100
  dataExfiltrationRisk: number // 0..100
  obfuscationRisk: number // 0..100
  domainRelevance: number // 0..100
  detectedTechniques: string[]
}

export type GuardrailAction =
  | 'ALLOW'
  | 'REDIRECT_OFF_DOMAIN'
  | 'RESTRICTED_GUARD'
  | 'BLOCK'

export type GuardrailDecision = {
  action: GuardrailAction
  reasonCode: string
  riskVector: RiskVector
  fallbackResponse?: string
  auditMetadata?: Record<string, unknown>
}

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  resetInSeconds: number
}

export type SecurityAuditRecord = {
  id: string
  timestamp: string
  conversationId: string
  clientHash: string
  action: GuardrailAction
  reasonCode: string
  riskVector: RiskVector
  latencyMs: number
}
