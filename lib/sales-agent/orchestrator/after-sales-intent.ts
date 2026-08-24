export type RequiredAfterSalesLookup =
  | { toolName: 'search_after_sales'; serviceType: 'warranty' | 'maintenance' | 'repair' | 'rescue' }
  | { toolName: 'find_service_locations' }

const CAR_HINT_PATTERN = /\b(?:o to|car|vf\s*(?:3|5|6|7|8|9|e34)|fadil|lux|president|lac hong|ec van|limo green|minio green|nerio green|herio green|mpv7)\b/i
const MOTORBIKE_HINT_PATTERN = /\b(?:xe may|motorbike|evo|feliz|klara|vento|theon|drgnfly|motio|amio|kinet)\b/i

function normalizeVietnamese(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase()
}

export function requiredAfterSalesLookup(text: string): RequiredAfterSalesLookup | null {
  const normalized = normalizeVietnamese(text)

  if (/\b(?:xuong(?: dich vu)?|trung tam dich vu|service center|dia chi (?:bao duong|sua chua))\b/i.test(normalized)) {
    return { toolName: 'find_service_locations' }
  }
  if (/\b(?:cuu ho|roadside assistance|ecall)\b/i.test(normalized)) {
    return { toolName: 'search_after_sales', serviceType: 'rescue' }
  }
  if (/\b(?:sua chua|repair)\b/i.test(normalized)) {
    return { toolName: 'search_after_sales', serviceType: 'repair' }
  }
  if (/\b(?:bao duong|maintenance)\b/i.test(normalized)) {
    return { toolName: 'search_after_sales', serviceType: 'maintenance' }
  }
  if (
    /\b(?:bao hanh|warranty)\b/i.test(normalized)
    && CAR_HINT_PATTERN.test(normalized)
    && !MOTORBIKE_HINT_PATTERN.test(normalized)
  ) {
    return { toolName: 'search_after_sales', serviceType: 'warranty' }
  }
  return null
}
