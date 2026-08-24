const WARRANTY_KNOWLEDGE_PATTERN =
  /\b(?:bao hanh|warranty|ac quy|chai pin|doi pin|thue pin|mua pin|pin thay(?: the)?|pin nguyen ban)\b/i
const CAR_WARRANTY_HINT_PATTERN =
  /\b(?:o to|car|vf\s*(?:3|5|6|7|8|9|e34)|fadil|lux|president|lac hong|ec van|limo green|minio green|nerio green|herio green|mpv7)\b/i
const MOTORBIKE_WARRANTY_HINT_PATTERN =
  /\b(?:xe may|motorbike|evo|feliz|klara|vento|theon|drgnfly|motio|amio|kinet)\b/i

function normalizeVietnamese(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase()
}

export function requiresWarrantyKnowledgeLookup(text: string) {
  const normalized = normalizeVietnamese(text)
  if (!WARRANTY_KNOWLEDGE_PATTERN.test(normalized)) return false
  if (MOTORBIKE_WARRANTY_HINT_PATTERN.test(normalized)) return true
  return !CAR_WARRANTY_HINT_PATTERN.test(normalized)
}
