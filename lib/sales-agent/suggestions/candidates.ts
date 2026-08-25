import type { ProductType } from '../contracts'

export type SuggestionKind =
  | 'CATALOG_PRICE'
  | 'CATALOG_COMPARE'
  | 'CATALOG_SPEC'
  | 'CATALOG_BROWSE'
  | 'FINANCE'
  | 'TEST_DRIVE'
  | 'ACCESSORY'
  | 'KNOWLEDGE_POLICY'
  | 'CLARIFICATION'
  | 'FOLLOW_UP'

export type SuggestionCandidate = {
  kind: SuggestionKind
  label: string
  payload: string
  entityIds?: string[]
  entityType?: ProductType
  source: 'MODEL_PLAN' | 'KNOWN_ENTITY' | 'CATALOG' | 'SAFE_DEFAULT'
  score: number
}

export type SuggestionProduct = {
  id?: string
  name: string
  productType?: ProductType
  slug?: string
}

export type SuggestionCandidateOptions = {
  knownProducts: SuggestionProduct[]
  catalogProducts: SuggestionProduct[]
  isClarificationTurn: boolean
  isComparisonTurn: boolean
  hasWarrantyOrBatteryPolicy?: boolean
}

function cleanProducts(products: SuggestionProduct[]) {
  const seen = new Set<string>()
  return products
    .map((product) => ({ ...product, name: product.name.trim() }))
    .filter((product) => {
      const key = product.name.toLocaleLowerCase('vi-VN')
      if (!product.name || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function withProduct(
  product: SuggestionProduct,
  kind: SuggestionKind,
  label: string,
  payload: string,
  score: number,
): SuggestionCandidate {
  return {
    kind,
    label,
    payload,
    entityIds: product.id ? [product.id] : undefined,
    entityType: product.productType,
    source: product.id ? 'KNOWN_ENTITY' : 'CATALOG',
    score,
  }
}

/**
 * Generates deterministic, catalog-grounded chips. This is intentionally a
 * pure function: the API route supplies the current catalog slice and the
 * composer can keep rendering safe defaults when a provider fails.
 */
export function buildSuggestionCandidates(options: SuggestionCandidateOptions): SuggestionCandidate[] {
  const knownProducts = cleanProducts(options.knownProducts)
  const catalogProducts = cleanProducts(options.catalogProducts)
  const products = knownProducts.length > 0 ? knownProducts : catalogProducts
  const candidates: SuggestionCandidate[] = []

  if (options.isClarificationTurn) {
    if (products.length >= 2) {
      const first = products[0]
      const second = products[1]
      candidates.push({
        kind: 'CATALOG_COMPARE',
        label: `So sánh ${first.name} và ${second.name}`,
        payload: `So sánh ${first.name} và ${second.name}`,
        entityIds: [first.id, second.id].filter((id): id is string => Boolean(id)),
        source: first.id && second.id ? 'KNOWN_ENTITY' : 'CATALOG',
        score: 100,
      })
    }
    candidates.push({
      kind: 'CLARIFICATION',
      label: 'Chọn hai mẫu xe để so sánh',
      payload: 'So sánh hai mẫu xe',
      source: 'SAFE_DEFAULT',
      score: 20,
    })
    return candidates
  }

  if (options.isComparisonTurn && products.length >= 2) {
    const first = products[0]
    const second = products[1]
    candidates.push({
      kind: 'CATALOG_COMPARE',
      label: `Xem lại ${first.name} và ${second.name}`,
      payload: `So sánh ${first.name} và ${second.name}`,
      entityIds: [first.id, second.id].filter((id): id is string => Boolean(id)),
      source: first.id && second.id ? 'KNOWN_ENTITY' : 'CATALOG',
      score: 100,
    })
  }

  if (products.length >= 2) {
    candidates.push(withProduct(products[0], 'CATALOG_PRICE', `Giá ${products[0].name}`, `Giá hiện tại ${products[0].name}`, 90))
    candidates.push({
      kind: 'CATALOG_COMPARE',
      label: `So sánh ${products[0].name} và ${products[1].name}`,
      payload: `So sánh ${products[0].name} và ${products[1].name}`,
      entityIds: [products[0].id, products[1].id].filter((id): id is string => Boolean(id)),
      source: products[0].id && products[1].id ? 'KNOWN_ENTITY' : 'CATALOG',
      score: 80,
    })
    const specProduct = products[2] ?? products[0]
    candidates.push(withProduct(specProduct, 'CATALOG_SPEC', `Thông số ${specProduct.name}`, `Thông số kỹ thuật ${specProduct.name}`, 70))
  } else if (products.length === 1) {
    candidates.push(withProduct(products[0], 'CATALOG_SPEC', `Thông số ${products[0].name}`, `Thông số kỹ thuật ${products[0].name}`, 90))
    candidates.push(withProduct(products[0], 'FINANCE', `Dự toán trả góp ${products[0].name}`, `Dự toán trả góp ${products[0].name}`, 70))
    candidates.push(withProduct(products[0], 'TEST_DRIVE', `Đặt lịch lái thử ${products[0].name}`, `Đặt lịch lái thử ${products[0].name}`, 60))
  } else {
    candidates.push({
      kind: 'CATALOG_BROWSE',
      label: 'Xem các mẫu xe đang bán',
      payload: 'Có những mẫu xe nào đang bán?',
      source: 'SAFE_DEFAULT',
      score: 70,
    })
    candidates.push({
      kind: 'FOLLOW_UP',
      label: 'Tư vấn chọn xe phù hợp',
      payload: 'Tư vấn chọn xe phù hợp',
      source: 'SAFE_DEFAULT',
      score: 60,
    })
  }

  if (options.hasWarrantyOrBatteryPolicy) {
    candidates.push({
      kind: 'KNOWLEDGE_POLICY',
      label: 'Chính sách bảo hành pin',
      payload: 'Chính sách bảo hành pin',
      source: 'SAFE_DEFAULT',
      score: 50,
    })
  }

  if (candidates.length === 0) {
    candidates.push({
      kind: 'FOLLOW_UP',
      label: 'Bạn muốn tìm hiểu thêm điều gì?',
      payload: 'Tôi muốn tìm hiểu thêm về xe điện',
      source: 'SAFE_DEFAULT',
      score: 10,
    })
  }

  return candidates
}

export function rankSuggestionCandidates(candidates: SuggestionCandidate[], limit = 3) {
  const seen = new Set<string>()
  return [...candidates]
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, 'vi-VN'))
    .filter((candidate) => {
      const key = `${candidate.kind}:${candidate.payload.toLocaleLowerCase('vi-VN')}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, Math.max(0, limit))
}
