const WARRANTY_KNOWLEDGE_PATTERN =
  /\b(?:bao hanh|warranty|ac quy|chai pin|doi pin|thue pin|mua pin|pin thay(?: the)?|pin nguyen ban)\b/i

function normalizeVietnamese(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase()
}

export function requiresWarrantyKnowledgeLookup(text: string) {
  return WARRANTY_KNOWLEDGE_PATTERN.test(normalizeVietnamese(text))
}
