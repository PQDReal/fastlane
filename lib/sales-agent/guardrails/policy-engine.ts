import type { GuardrailDecision, RiskVector } from './types'

const SAFE_REFUSAL_MESSAGE =
  'Dạ em là Trợ lý tư vấn xe điện FASTLANE. Em chỉ hỗ trợ giải đáp các câu hỏi liên quan đến sản phẩm ô tô, xe máy điện, bảng giá, chính sách bảo hành và dịch vụ của FASTLANE ạ.'

const FRIENDLY_OFF_DOMAIN_REDIRECT =
  'Dạ em là Trợ lý tư vấn ô tô & xe máy điện FASTLANE. Em chuyên hỗ trợ tìm hiểu các dòng xe VinFast, bảng giá, thủ tục trả góp và chính sách bảo hành. Anh/chị đang quan tâm đến dòng xe nào để em hỗ trợ tư vấn chi tiết ạ?'

export function evaluatePolicy(risk: RiskVector): GuardrailDecision {
  // 1. Hard Security Violation: Block directly without invoking LLM
  if (risk.injectionRisk >= 75) {
    return {
      action: 'BLOCK',
      reasonCode: 'PROMPT_INJECTION_DETECTED',
      riskVector: risk,
      fallbackResponse: SAFE_REFUSAL_MESSAGE,
      auditMetadata: {
        detectedTechniques: risk.detectedTechniques,
      },
    }
  }

  if (risk.dataExfiltrationRisk >= 75) {
    return {
      action: 'BLOCK',
      reasonCode: 'CREDENTIAL_EXFILTRATION_DETECTED',
      riskVector: risk,
      fallbackResponse: SAFE_REFUSAL_MESSAGE,
      auditMetadata: {
        detectedTechniques: risk.detectedTechniques,
      },
    }
  }

  // 2. Suspicious Obfuscation or Moderate Injection: Restricted Guard
  if (risk.injectionRisk >= 40 || risk.obfuscationRisk >= 50) {
    return {
      action: 'RESTRICTED_GUARD',
      reasonCode: 'SUSPICIOUS_PROMPT_CONSTRAINED',
      riskVector: risk,
      auditMetadata: {
        detectedTechniques: risk.detectedTechniques,
      },
    }
  }

  // 3. Off-domain redirection (e.g. coding questions, poetry, irrelevant topics)
  if (risk.domainRelevance < 15 && risk.detectedTechniques.includes('OFF_DOMAIN_PROMPT')) {
    return {
      action: 'REDIRECT_OFF_DOMAIN',
      reasonCode: 'OFF_DOMAIN_REDIRECT',
      riskVector: risk,
      fallbackResponse: FRIENDLY_OFF_DOMAIN_REDIRECT,
      auditMetadata: {
        detectedTechniques: risk.detectedTechniques,
      },
    }
  }

  // 4. Safe Query within domain
  return {
    action: 'ALLOW',
    reasonCode: 'SAFE_IN_DOMAIN',
    riskVector: risk,
  }
}
