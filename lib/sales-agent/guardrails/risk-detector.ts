import type { DetectionViews } from './canonicalizer'
import type { RiskVector } from './types'

// Fastlane automotive & purchase domain keywords
const AUTOMOTIVE_DOMAIN_PATTERNS = [
  /\bvf\s*[-_]?\s*[0-9]+(?:\s*plus)?\b/i,
  /\b(?:evo\s*200|feliz\s*s?|klara\s*s?|vento\s*s?|theon\s*s?|amio|flazz|vero|kinet)\b/i,
  /\b(?:ô tô|xe máy|xe điện|vinfast|fastlane|xe hơi|suv|sedan)\b/i,
  /\b(?:pin|thuê pin|mua pin|trạm sạc|v-green|cứu hộ|sạc nhanh|kwh|dung lượng pin)\b/i,
  /\b(?:giá xe|bảng giá|giá lăn bánh|chi phí|khuyến mãi|ưu đãi|giảm giá)\b/i,
  /\b(?:đặt cọc|tiền cọc|hợp đồng|thủ tục|nhận xe|bàn giao|lái thử|đặt lịch)\b/i,
  /\b(?:trả góp|lãi suất|vay vốn|ngân hàng|dư nợ|thời hạn vay|bảo hành)\b/i,
  /\b(?:phụ kiện|thảm lót|sạc di động|bọc vô lăng|camera hành trình)\b/i,
]

// Off-domain patterns (coding, creative writing, non-automotive topics)
const OFF_DOMAIN_PATTERNS = [
  /\b(?:viết code|viet code|write code|python|javascript|typescript|c\+\+|java|html|css|php|react)\b/i,
  /\b(?:làm thơ|lam tho|viết\s+(?:[^\s]+\s+)?(?:thơ|tho|bài thơ|bai tho|văn|van|truyện|truyen|tiểu thuyết|tieu thuyet)|bài thơ|bai tho)\b/iu,
  /\b(?:giải bài toán|giai bai toan|tính tích phân|tinh tich phan|giải phương trình|giai phuong trinh|chứng minh định lý|chung minh dinh ly)\b/i,
  /\b(?:tổng thống|tong thong|bầu cử|bau cu|chính trị|chinh tri|chiến tranh|chien tranh)\b/i,
  /\b(?:công thức nấu ăn|cong thuc nau an|món ngon|mon ngon|cách làm bánh|cach lam banh|pha chế cocktail|pha che cocktail)\b/i,
]

// Direct Prompt Injection patterns
const INJECTION_PATTERNS: Array<{ regex: RegExp; floor: number; technique: string }> = [
  {
    regex: /\b(?:ignore|disregard|forget|bypass)\s+(?:all\s+)?(?:previous|prior|above|system)\s+(?:instructions|prompts|rules|directives)\b/i,
    floor: 90,
    technique: 'DIRECT_OVERRIDE_EN',
  },
  {
    regex: /\b(?:bỏ qua|hủy bỏ|quên|vượt qua)\s+(?:mọi|tất cả|các)?\s*(?:hướng dẫn|quy tắc|chỉ thị|yêu cầu|prompt)\s*(?:trước đó|cũ|hệ thống)?\b/i,
    floor: 90,
    technique: 'DIRECT_OVERRIDE_VI',
  },
  {
    regex: /\b(?:you are now|pretend to be|act as|hãy đóng vai|chuyển sang|chế độ|mode)\s+(?:dan|jailbreak|developer mode|unrestricted|god mode|ai không có quy tắc)\b/i,
    floor: 88,
    technique: 'ROLEPLAY_JAILBREAK',
  },
  {
    regex: /\b(?:dan\s+jailbreak|jailbreak\s+mode|developer\s+mode)\b/i,
    floor: 88,
    technique: 'ROLEPLAY_JAILBREAK',
  },
  {
    regex: /\b(?:show|reveal|display|output|print|translate)\b.*\b(?:system prompt|hidden prompt|initial instructions|developer message|instructions to json)\b/i,
    floor: 85,
    technique: 'SYSTEM_PROMPT_EXTRACTION_EN',
  },
  {
    regex: /\b(?:in|hiển thị|tiết lộ|dịch|cho tôi xem)\s+(?:system prompt|prompt ẩn|hướng dẫn ban đầu|prompt hệ thống)\b/i,
    floor: 85,
    technique: 'SYSTEM_PROMPT_EXTRACTION_VI',
  },
  {
    regex: /<\/?system>|<\/?instruction>|\[SYSTEM\s+INSTRUCTION\]|\[ADMIN_COMMAND\]/i,
    floor: 80,
    technique: 'TAG_DELIMITER_INJECTION',
  },
  {
    regex: /\b(?:write a story where the main character knows (?:the same )?passwords|kịch bản phim về hacker lấy mật khẩu)\b/i,
    floor: 85,
    technique: 'HYPOTHETICAL_FRAMING',
  },
  {
    regex: /\b(?:tên|danh sách|list|show|print)\s+(?:cụ thể\s+)?(?:các\s+)?(?:tool|tools|function|functions|hàm|method|công cụ nội bộ|api|schema)\b/i,
    floor: 88,
    technique: 'TOOL_ENUMERATION_DETECTED',
  },
  {
    regex: /\b(?:tên\s+cụ\s+thể|name\s+cụ\s+thể|name\s+cu\s+the|tool\s+names?|function\s+names?)\b/i,
    floor: 88,
    technique: 'TOOL_ENUMERATION_DETECTED',
  },
  {
    regex: /\b(?:browse_catalog|resolve_catalog_entities|get_product_details|search_knowledge|discover_accessories|get_current_promotions)\b/i,
    floor: 90,
    technique: 'INTERNAL_ARCHITECTURE_PROBING',
  },
]

// Data Exfiltration & Credential Extraction patterns
const EXFILTRATION_PATTERNS: Array<{ regex: RegExp; floor: number; technique: string }> = [
  {
    regex: /\b(?:admin password|mật khẩu admin|mật khẩu quản trị|db password|root password)\b/i,
    floor: 95,
    technique: 'CREDENTIAL_HARVESTING',
  },
  {
    regex: /\b(?:database connection|connection string|db connection|chuỗi kết nối db|chuỗi kết nối database)\b/i,
    floor: 90,
    technique: 'CREDENTIAL_HARVESTING',
  },
  {
    regex: /\b(?:api key|secret key|access token|bearer token|private key|env secret)\b/i,
    floor: 90,
    technique: 'API_KEY_EXTRACTION',
  },
  {
    regex: /\b(?:fill in:\s*the database connection string is|cung cấp chuỗi kết nối database)\b/i,
    floor: 90,
    technique: 'COMPLETION_INJECTION',
  },
  {
    regex: /\b(?:union\s+select|select\s+.*\s+from\s+users|drop\s+table|delete\s+from\s+users|insert\s+into\s+users)\b/i,
    floor: 80,
    technique: 'SQL_SYNTAX_INJECTION',
  },
]

export function detectRisks(views: DetectionViews): RiskVector {
  let injectionRisk = 0
  let dataExfiltrationRisk = 0
  let obfuscationRisk = 0
  let domainRelevance = 0
  const detectedTechniques = new Set<string>()

  // All text candidate strings to check
  const candidatesToCheck = [
    views.raw,
    views.normalizedNfkc,
    views.collapsedSpacedLetters,
    views.confusableNormalized,
    views.unaccentedVietnamese,
    views.unaccentedCollapsed,
    ...views.decodedFragments,
  ]

  // 1. Evaluate Injection Risk across all detection views
  for (const text of candidatesToCheck) {
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.regex.test(text)) {
        injectionRisk = Math.max(injectionRisk, pattern.floor)
        detectedTechniques.add(pattern.technique)
      }
    }
  }

  // 1b. Evaluate dense no-spaces string (catches any letter-level obfuscation)
  const dense = views.denseNoSpaces
  if (
    /boqua.*(?:huongdan|quytac|chithi|prompt)/.test(dense) ||
    /ignore.*(?:previous|instruction|prompt|rule|directive)/.test(dense) ||
    /systemprompt|prompthan|prompthethong/.test(dense) ||
    /youarenowdan|iamdan|developermode|jailbreakmode/.test(dense)
  ) {
    injectionRisk = Math.max(injectionRisk, 90)
    detectedTechniques.add('DENSE_OBFUSCATED_OVERRIDE')
  }

  // 2. Evaluate Data Exfiltration Risk
  for (const text of candidatesToCheck) {
    for (const pattern of EXFILTRATION_PATTERNS) {
      if (pattern.regex.test(text)) {
        dataExfiltrationRisk = Math.max(dataExfiltrationRisk, pattern.floor)
        detectedTechniques.add(pattern.technique)
      }
    }
  }

  if (
    /adminpassword|matkhauadmin|matkhauquantri|databaseconnection|dbpassword|rootpassword/.test(dense) ||
    /apikey|accesstoken|bearertoken|secretkey/.test(dense)
  ) {
    dataExfiltrationRisk = Math.max(dataExfiltrationRisk, 90)
    detectedTechniques.add('DENSE_OBFUSCATED_EXFILTRATION')
  }

  // 3. Evaluate Obfuscation Risk
  if (views.hasInvisibleChars) {
    obfuscationRisk += 40
    detectedTechniques.add('ZERO_WIDTH_CHARS')
  }
  if (views.hasSuspiciousEncoding) {
    obfuscationRisk += 45
    detectedTechniques.add('ENCODED_PAYLOAD_DETECTED')
  }
  if (views.collapsedSpacedLetters !== views.confusableNormalized && views.collapsedSpacedLetters.length < views.confusableNormalized.length - 4) {
    obfuscationRisk += 35
    detectedTechniques.add('SPACED_LETTER_OBFUSCATION')
  }
  obfuscationRisk = Math.min(100, obfuscationRisk)

  // 4. Evaluate Domain Relevance
  for (const pattern of AUTOMOTIVE_DOMAIN_PATTERNS) {
    if (pattern.test(views.raw) || pattern.test(views.unaccentedVietnamese)) {
      domainRelevance += 25
    }
  }
  for (const pattern of OFF_DOMAIN_PATTERNS) {
    if (pattern.test(views.raw) || pattern.test(views.unaccentedVietnamese)) {
      domainRelevance = Math.max(0, domainRelevance - 40)
      detectedTechniques.add('OFF_DOMAIN_PROMPT')
    }
  }
  domainRelevance = Math.min(100, Math.max(0, domainRelevance))

  // CRITICAL: Non-compensatory rule. Domain relevance NEVER decreases injectionRisk or dataExfiltrationRisk!

  return {
    injectionRisk,
    dataExfiltrationRisk,
    obfuscationRisk,
    domainRelevance,
    detectedTechniques: Array.from(detectedTechniques),
  }
}
