const MANUAL_TOPIC_PATTERN =
  /\b(?:cong sac|nap sac|o sac|cach sac|cach khoi dong|nut bam|den canh bao|bieu tuong canh bao|tui khi|phanh tay|mo cua|khoa cua|gap guong|dieu hoa|can gat mua|huong dan su dung|hdsd|user manual)\b/i

function normalizeVietnamese(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
}

export function requiresManualLookup(text: string): boolean {
  return MANUAL_TOPIC_PATTERN.test(normalizeVietnamese(text))
}
