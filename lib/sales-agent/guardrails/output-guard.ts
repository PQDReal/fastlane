const SECRET_LEAKAGE_PATTERNS = [
  /\bsk-[a-zA-Z0-9_-]{20,}\b/g,
  /\bAIzaSy[a-zA-Z0-9_-]{33}\b/g,
  /\bBearer\s+[a-zA-Z0-9._-]{24,}\b/gi,
  /\bpostgres(?:ql)?:\/\/[a-zA-Z0-9_:@./-]+/gi,
  /\b(?:password|mật khẩu)\s*[:=]\s*["']?[a-zA-Z0-9@#$%^&*()_+]{6,}["']?/gi,
]

const PII_SOLICITATION_PATTERNS = [
  /\b(?:vui lòng|hãy|bạn cần)\s+(?:gửi|cung cấp|nhập)\s+(?:mã\s+)?otp\b/i,
  /\b(?:gửi|cung cấp|nhập)\s+(?:mật khẩu|password|mã pin)\b/i,
  /\b(?:gửi|chụp)\s+(?:ảnh\s+)?(?:2 mặt\s+)?cccd\b/i,
  /\b(?:nhập|gửi)\s+(?:số\s+)?thẻ\s+(?:tín dụng|ngân hàng|cvv)\b/i,
]

const INTERNAL_TOOL_SIGNATURE_PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
  { regex: /\bbrowse_catalog\b/g, replacement: 'Tra cứu danh mục sản phẩm' },
  { regex: /\bresolve_catalog_entities\b/g, replacement: 'Nhận diện sản phẩm' },
  { regex: /\bget_product_details\b/g, replacement: 'Xem chi tiết sản phẩm' },
  { regex: /\bsearch_knowledge\b/g, replacement: 'Tra cứu cẩm nang & tri thức' },
  { regex: /\bdiscover_accessories\b/g, replacement: 'Tìm phụ kiện chính hãng' },
  { regex: /\bget_current_promotions\b/g, replacement: 'Kiểm tra khuyến mãi' },
]

export function sanitizeOutputText(text: string): { sanitized: string; redactedCount: number; solicitedPii: boolean } {
  if (!text) return { sanitized: text, redactedCount: 0, solicitedPii: false }

  let sanitized = text
  let redactedCount = 0

  // 1. Redact secrets
  for (const pattern of SECRET_LEAKAGE_PATTERNS) {
    if (pattern.test(sanitized)) {
      redactedCount++
      sanitized = sanitized.replace(pattern, '[BẢO MẬT: THÔNG TIN ĐÃ ĐƯỢC ẨN]')
    }
  }

  // 2. Sanitize internal tool function names if leaked
  for (const { regex, replacement } of INTERNAL_TOOL_SIGNATURE_PATTERNS) {
    if (regex.test(sanitized)) {
      sanitized = sanitized.replace(regex, replacement)
    }
  }

  // 2. Detect forbidden PII solicitations
  let solicitedPii = false
  for (const pattern of PII_SOLICITATION_PATTERNS) {
    if (pattern.test(sanitized)) {
      solicitedPii = true
      break
    }
  }

  // If model solicited PII against policy, append strong security advisory
  if (solicitedPii) {
    sanitized = `${sanitized}\n\n> ⚠️ **Lưu ý bảo mật FASTLANE:** FASTLANE không bao giờ yêu cầu quý khách cung cấp mã OTP, mật khẩu hay thông tin thẻ trong khung chat.`
  }

  return {
    sanitized,
    redactedCount,
    solicitedPii,
  }
}
