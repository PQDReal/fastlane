import type { AssistantFilters, RuleResult } from './types'
import { normalizeProductSearchText } from '@/lib/catalog/search'
import { CONVERSATION_STOP_WORDS, FAQ_WORDS, RECOMMENDATION_WORDS } from './config'

// ---------------------------------------------------------------------------
// Giai đoạn 1: Khai báo từ vựng parser và chuẩn hóa dữ liệu người dùng nhập.
// ---------------------------------------------------------------------------
// Chủ động duy trì hai dạng dữ liệu đã chuẩn hóa:
// - văn bản catalog tách mã mẫu xe để `VF9` và `VF 9` tương đương nhau;
// - văn bản tiền tệ giữ dấu phân cách để `20-000000` vẫn là một số tiền.
const normalized = (value: string) => normalizeProductSearchText(value)
const COMBINING_MARKS = /[\u0300-\u036f]/g
// Thứ tự các nhánh rất quan trọng: dạng không tiêu chuẩn `20-000000` phải được
// nhận thành một số tiền hoàn chỉnh trước khi nhánh phân nhóm thông thường chỉ
// khớp phần đầu `20-000`. Nhánh cuối cùng còn hỗ trợ số triệu dạng thập phân.
const MONEY_NUMBER_PATTERN = String.raw`(?:\d{1,3}-\d{6}|\d{1,3}(?:[.,-]\d{3})+|\d+(?:[.,]\d+)?)`
const MONEY_UNIT_PATTERN = String.raw`(?:tr(?:ieu)?|k|nghin|ngan|vnd|d)`
// Các cụm casual có thể đứng trước hoặc sau một yêu cầu catalog hợp lệ. Chúng
// bị loại khỏi từ khóa tìm kiếm và chỉ tạo intent `casual` khi câu không còn
// nội dung nào có thể xử lý.
const CASUAL_PHRASE_PATTERN = String.raw`(?:(?:xin\s+)?chao(?:\s+cac\s+ban|\s+ban)?|hello|hi|hey|cam\s+on(?:\s+ban)?|thank\s+you|thank|thanks|ban\s+la\s+ai|giup\s+(?:toi|minh))`

/**
 * Giữ nguyên dấu phân cách tiền tệ trong khi chuẩn hóa các từ so sánh tiếng
 * Việt. Bộ chuẩn hóa catalog thông thường chủ động đổi dấu câu thành khoảng
 * trắng, làm mất sự khác biệt giữa `20-000000` và `20`.
 */
function normalizeMoneyQuery(value: string) {
  return value
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9.,-]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function stripCasualPhrases(query: string) {
  return query
    .replace(new RegExp(String.raw`\b${CASUAL_PHRASE_PATTERN}\b`, 'g'), ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function isCasualOnlyQuery(query: string) {
  const hasCasualPhrase = new RegExp(String.raw`\b${CASUAL_PHRASE_PATTERN}\b`).test(query)
  if (!hasCasualPhrase) return false
  return stripCasualPhrases(query)
    .split(' ')
    .filter((token) => token && !CONVERSATION_STOP_WORDS.has(token))
    .length === 0
}

// ---------------------------------------------------------------------------
// Giai đoạn 2: Loại bỏ nội dung hội thoại dư thừa và tạo từ khóa catalog.
// ---------------------------------------------------------------------------
// Giai đoạn này phải giữ lại định danh sản phẩm (`VF 9`, `Amio`) trong khi loại
// bỏ lời chào, từ yêu cầu chung chung và các phần số thuộc ngân sách.
/** Loại bỏ từ hội thoại dư thừa nhưng vẫn giữ tên mẫu xe và từ khóa sản phẩm. */
export function extractCatalogSearchQuery(input: string) {
  // Đối sánh catalog và phân tích tiền sử dụng hai chuỗi chuẩn hóa riêng. Nhờ
  // đó catalog có thể so sánh `VF9` dưới dạng `vf 9`, còn parser tiền tệ vẫn
  // nhìn thấy dấu phân cách trong `20.000.000` hoặc `20-000000`.
  const query = stripCasualPhrases(normalized(input))
  const moneyQuery = normalizeMoneyQuery(input)
  const hasBudget = priceRangeFromQuery(moneyQuery) != null || priceFromQuery(moneyQuery) != null
  const tokens = query.split(' ').filter(Boolean)
  const meaningful = tokens.filter((token, index) => {
    if (CONVERSATION_STOP_WORDS.has(token)) return false
    if (!/^\d+$/.test(token)) return true

    // Giữ mã sản phẩm như `VF 9`, nhưng loại mọi phần số thuộc giá hoặc khoảng
    // giá đã nhận diện, bao gồm `20-000000` sau khi thành `20 000000`.
    const previous = tokens[index - 1] ?? ''
    const isBudgetNumber = ['trieu', 'nghin', 'ngan', 'vnd', 'd'].includes(tokens[index + 1] ?? '')
    if (isBudgetNumber) return false
    const isModelNumber = /^[a-z]+$/.test(previous) && !CONVERSATION_STOP_WORDS.has(previous)
    if (isModelNumber) return true
    return !hasBudget && !isBudgetNumber
  })
  return meaningful.join(' ')
}

function removeIntentWords(query: string, words: ReadonlySet<string>) {
  return query.split(' ').filter((token) => token && !words.has(token)).join(' ')
}

// ---------------------------------------------------------------------------
// Giai đoạn 3: Chuyển một mức giá hoặc khoảng giá bao gồm hai biên thành VND.
// ---------------------------------------------------------------------------
// Việc phân tích diễn ra trước khi quyết định intent vì một ngân sách hợp lệ
// tự nó đã đủ để xác định đây là yêu cầu gợi ý sản phẩm.
function priceAmount(value: string, unit = ''): number | undefined {
  // Dấu chấm, phẩy và gạch nối chỉ là dấu phân cách hàng nghìn khi mọi nhóm có
  // đúng độ dài dự kiến. Nếu không, dấu phẩy/chấm vẫn là dấu thập phân, ví dụ
  // `15,5 trieu` được chuyển thành 15.500.000 VND.
  const grouped = /^\d{1,3}-\d{6}$/.test(value) || /^\d{1,3}(?:[.,-]\d{3})+$/.test(value)
  const amount = grouped
    ? Number(value.replace(/[.,-]/g, ''))
    : Number(value.replace(',', '.'))
  if (!Number.isFinite(amount)) return undefined
  const normalizedUnit = normalized(unit)
  if (normalizedUnit.startsWith('tr')) return Math.round(amount * 1_000_000)
  if (normalizedUnit === 'k' || normalizedUnit.includes('nghin') || normalizedUnit.includes('ngan')) return Math.round(amount * 1_000)
  return amount >= 1000 ? Math.round(amount) : undefined
}

function priceFromQuery(moneyQuery: string): number | undefined {
  // Quét mọi số có khả năng là giá thay vì dừng ở số đầu tiên. Tên mẫu xe có
  // thể đứng trước ngân sách (`VF 9 duoi 900 trieu`) và `9` không phải mức giá
  // độc lập hợp lệ, nên parser phải tiếp tục tới `900 trieu`.
  const matcher = new RegExp(String.raw`\b(${MONEY_NUMBER_PATTERN})\s*(${MONEY_UNIT_PATTERN})?\b`, 'gi')
  for (const match of moneyQuery.matchAll(matcher)) {
    const amount = priceAmount(match[1], match[2])
    if (amount != null) return amount
  }
  return undefined
}

function priceRangeFromQuery(moneyQuery: string) {
  // Nếu chỉ một biên khai báo đơn vị, dùng đơn vị đó cho biên còn lại: `tu 15
  // den 25 trieu` là khoảng 15–25 triệu, không phải từ 15 VND đến 25 triệu.
  const matcher = new RegExp(
    String.raw`(?:\btu\s+)?(${MONEY_NUMBER_PATTERN})\s*(${MONEY_UNIT_PATTERN})?\s*(?:den|toi|-)\s*(${MONEY_NUMBER_PATTERN})\s*(${MONEY_UNIT_PATTERN})?\b`,
    'i',
  )
  const match = moneyQuery.match(matcher)
  if (!match) return undefined
  const first = priceAmount(match[1], match[2] || match[4])
  const second = priceAmount(match[3], match[4] || match[2])
  return first != null && second != null ? { min: Math.min(first, second), max: Math.max(first, second) } : undefined
}

/**
 * Giai đoạn 4: Nhận diện loại sản phẩm và tạo bộ lọc/sắp xếp có cấu trúc.
 *
 * Đây là pipeline rule tất định. Rule có ngữ cảnh cụ thể phải chạy trước intent
 * fallback tổng quát; đặc biệt, recommendation/FAQ hợp lệ phải được ưu tiên
 * hơn lời chào đứng xung quanh. Giữ đúng thứ tự tại các lệnh return bên dưới.
 */
export function classifySearchQuery(input: string): RuleResult {
  const query = normalized(input)
  const moneyQuery = normalizeMoneyQuery(input)
  const catalogQuery = extractCatalogSearchQuery(input)
  const filters: AssistantFilters = {}
  // Kiểm tra phụ kiện trước vì yêu cầu phụ kiện có thể chứa tên xe tương thích.
  // `sac` dùng ranh giới từ để `ngan sach` không bị nhầm với từ độc lập `sac`
  // sau khi bỏ dấu tiếng Việt.
  if (/(phu kien|accessor|tam che|tham san|\bsac\b|bao da|dan film|rem tran|ao phong|binh giu nhiet)/.test(query)) filters.productType = 'accessory'
  else if (/xe may|scooter|motorbike/.test(query)) filters.productType = 'motorbike'
  else if (/\bo to\b|\boto\b|\bcar\b|\bsuv\b|\bsedan\b|\bvf\s*\d+\b/.test(query)) filters.productType = 'car'

  const range = priceRangeFromQuery(moneyQuery)
  const budget = priceFromQuery(moneyQuery)
  if (range) {
    filters.minPrice = range.min
    filters.maxPrice = range.max
  } else if (budget) {
    const hasExplicitMinimum = /(khong thap hon|khong duoi|tro len|tro di|tren|\btu\b|toi thieu|it nhat|cao hon|lon hon|\bhon\b|min)/.test(query)
    const hasExplicitMaximum = /(khong cao hon|khong hon|tro xuong|duoi|toi da|khong qua|nho hon|thap hon|re hon|max)/.test(query)
    // Xử lý cụm phủ định/phức hợp rõ nghĩa trước các từ chung như `hon` hoặc
    // `tu`. Nếu làm ngược lại, `khong hon` và `tro xuong` có thể bị nhận nhầm
    // thành yêu cầu giá tối thiểu.
    if (/(khong thap hon|khong duoi)/.test(query)) filters.minPrice = budget
    else if (/(khong cao hon|khong hon|nho hon|thap hon|re hon)/.test(query)) filters.maxPrice = budget
    else if (/tro xuong/.test(query)) filters.maxPrice = budget
    else if (/(tro len|tro di)/.test(query)) filters.minPrice = budget
    else if (hasExplicitMinimum) filters.minPrice = budget
    else if (hasExplicitMaximum) filters.maxPrice = budget
    else if (/(gia|ngan sach|tam gia|khoang|trong khoang)/.test(query)) filters.maxPrice = budget
  }

  // Giới hạn và sắp xếp là hai khái niệm khác nhau: `20 trieu tro len` thiết
  // lập minPrice, còn `gia tang dan` sắp xếp tập sản phẩm phù hợp.
  if (/\b(re|thap) nhat\b/.test(query)) { filters.sort = 'price_asc'; filters.sortBy = 'price'; filters.sortDirection = 'asc' }
  if (/\b(dat|cao) nhat\b/.test(query)) { filters.sort = 'price_desc'; filters.sortBy = 'price'; filters.sortDirection = 'desc' }
  if (/\b(?:gia\s+)?(?:tang dan|thap den cao|tu thap den cao|asc|ascending)\b/.test(query)) { filters.sort = 'price_asc'; filters.sortBy = 'price'; filters.sortDirection = 'asc' }
  if (/\b(?:gia\s+)?(?:giam dan|cao den thap|tu cao (?:den|xuong) thap|desc|descending)\b/.test(query)) { filters.sort = 'price_desc'; filters.sortBy = 'price'; filters.sortDirection = 'desc' }
  const descending = /\b(nhanh|xa|cao|lon|manh) nhat\b/.test(query)
  const ascending = /\b(cham|ngan|thap|nho|yeu) nhat\b/.test(query)
  if (/\b(nhanh|cham) nhat\b|\btoc do (cao|thap) nhat\b/.test(query)) { filters.sortBy = 'top_speed'; filters.sortDirection = descending || /toc do cao nhat/.test(query) ? 'desc' : 'asc' }
  if (/\b(xa|ngan) nhat\b|\b(pham vi|quang duong|tam hoat dong) (lon|nho|xa|ngan) nhat\b/.test(query)) { filters.sortBy = 'range'; filters.sortDirection = descending || /\b(pham vi|quang duong|tam hoat dong) (lon|xa) nhat\b/.test(query) ? 'desc' : 'asc' }
  if (/\b(cong suat (cao|thap)|manh|yeu) nhat\b/.test(query)) { filters.sortBy = 'power'; filters.sortDirection = descending || /cong suat cao nhat/.test(query) ? 'desc' : 'asc' }
  if (/\b(pin|dung luong pin) (lon|nho) nhat\b/.test(query)) { filters.sortBy = 'battery'; filters.sortDirection = descending ? 'desc' : 'asc' }
  // Yêu cầu ngữ cảnh màu sắc/giới tính rõ ràng để tránh xung đột như `tìm`
  // thành `tim` và `tốc độ` chứa `do` sau khi chuẩn hóa.
  const colorMatch = query.match(/\bmau\s+(den|trang|do|xanh|vang|xam|bac|hong|tim|nau)\b/)
  if (colorMatch) filters.color = colorMatch[1]
  const genderMatch = query.match(/\b(?:cho|danh cho|gioi tinh)\s+(nam(?:\s+gioi)?|nu(?:\s+gioi)?|unisex)\b/)
  if (genderMatch) filters.gender = genderMatch[1].replace(/\s+gioi$/, '')

  // -------------------------------------------------------------------------
  // Giai đoạn 5: Chọn chính xác một intent theo thứ tự ưu tiên đã xác lập.
  // -------------------------------------------------------------------------
  // Bộ lọc đã hoàn chỉnh tại đây. Khối này chỉ quyết định cách API phản hồi và
  // không được diễn giải lại giá hoặc từ khóa sản phẩm.
  // Thứ tự intent là có chủ đích:
  // bộ lọc/xếp hạng recommendation -> FAQ sản phẩm -> chỉ casual -> tìm kiếm.
  // Nếu đưa casual lên trước hai loại đầu, câu `xin chao, VF9 bao xa` sẽ dừng
  // tại lời chào và không bao giờ xử lý query catalog hợp lệ.
  if (filters.maxPrice || filters.minPrice || filters.sort || filters.sortBy || filters.color || filters.gender || /(phu hop|goi y|nen mua|tu van|ngan sach)/.test(query)) {
    return { intent: 'recommendation', confidence: 0.9, normalizedQuery: query, catalogQuery: removeIntentWords(catalogQuery, RECOMMENDATION_WORDS), filters }
  }
  if (/(bao hanh|thong so|phanh|pin|pham vi|toc do|cong suat|chinh sach|bao xa|di duoc)/.test(query)) {
    return { intent: 'product_faq', confidence: 0.82, normalizedQuery: query, catalogQuery: removeIntentWords(catalogQuery, FAQ_WORDS), filters }
  }
  if (!filters.productType && isCasualOnlyQuery(query)) {
    return { intent: 'casual', confidence: 0.95, normalizedQuery: query, catalogQuery, filters }
  }
  if (query.length >= 2) return { intent: 'product_search', confidence: 0.75, normalizedQuery: query, catalogQuery, filters }
  return { intent: 'unsupported', confidence: 0.5, normalizedQuery: query, catalogQuery, filters }
}

export const normalizeAssistantQuery = normalized
