import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const input = path.join(ROOT, 'public/data/after-sales.json')
const output = path.join(ROOT, 'public/data/after-sales-parsed.json')
const data = JSON.parse(fs.readFileSync(input, 'utf8'))

const patterns = {
  table: /(?:^|[\/_-])(table|bang|bảng|chart|schedule|timeline|infographic|thong[-_ ]?so|specification)(?:[\/_-]|\.|$)/i,
  vehicle: /vf\d|car|oto|ô tô|bike|xe-may|xe máy|motorbike|scooter|ebus|bus/i,
  portrait: /portrait|person|people|customer|family|nhân viên|khách hàng|tư vấn/i,
  decorative: /banner|hero|background|logo|icon|menu-cta|homepage/i,
  servicePhoto: /aftersale-(?:warranty|repair|rescue)\/(?:warranty-|repair-|rescue-)|aftersale-shared\/hero-repair/i,
}

function assetSemanticText(asset) {
  let pathname = asset.url || ''
  try {
    pathname = decodeURIComponent(new URL(asset.url).pathname)
  } catch {}
  return `${pathname} ${asset.label || ''}`
}

function classify(asset, source) {
  const haystack = assetSemanticText(asset)
  const sourceContext = `${source.serviceType || ''} ${source.title || ''}`
  const isPdf = asset.type === 'pdf' || /\.pdf(?:[?#]|$)/i.test(asset.url)
  if (isPdf) {
    const role = source.serviceType === 'rescue' ? 'emergency_response_document' : 'structured_policy_source'
    return { dataType: 'policy_document', contentRole: role, confidence: 'high', signals: ['official_pdf_link', source.serviceType], needsReview: false, extractionPolicy: 'pdf_text_layer' }
  }
  if (!isPdf && /(^|[\/_-])icon([\/_-]|\.|$)|logo|caret|arrow|badge/i.test(asset.url)) {
    return { dataType: 'decorative_asset', contentRole: 'presentation_icon', confidence: 'high', signals: ['icon_or_ui_asset'], needsReview: false, extractionPolicy: 'metadata_only' }
  }
  const signals = []
  if (patterns.table.test(haystack)) signals.push('table_or_numeric_terms')
  if (patterns.vehicle.test(haystack)) signals.push('vehicle_terms')
  if (patterns.portrait.test(haystack)) signals.push('people_terms')
  if (patterns.decorative.test(haystack)) signals.push('decorative_terms')
  if (patterns.servicePhoto.test(haystack)) signals.push('known_service_photo_path')

  if (signals.includes('table_or_numeric_terms')) return { dataType: 'informational_graphic_or_table', contentRole: 'policy_supporting_data', confidence: 'medium', signals, needsReview: true, extractionPolicy: 'ocr_vie_eng' }
  if (signals.includes('known_service_photo_path') || signals.includes('vehicle_terms') || signals.includes('people_terms') || signals.includes('decorative_terms')) {
    const contentRole = /hero|banner/i.test(haystack) ? 'hero_or_banner_photo' : 'service_or_component_illustration'
    return { dataType: 'vehicle_or_service_photo', contentRole, confidence: 'high', signals, needsReview: false, extractionPolicy: 'metadata_only' }
  }
  return { dataType: 'image_unknown', contentRole: 'unclassified_asset', confidence: 'low', signals: [...signals, sourceContext], needsReview: true, extractionPolicy: 'manual_review' }
}

const records = data.records.map(source => ({
  ...source,
  assets: (source.assets || []).map(asset => ({ ...asset, classification: classify(asset, source) })),
}))
const counts = {}
for (const source of records) for (const asset of source.assets) {
  const type = asset.classification.dataType
  counts[type] = (counts[type] || 0) + 1
}
const assetCount = Object.values(counts).reduce((a, b) => a + b, 0)
const parsed = { ...data, parserVersion: 'after-sales-assets-v2', parsedAt: new Date().toISOString(), parserMethod: 'source_scoped_url_label_context_rules', notes: ['Only explicit table/chart/spec image paths become OCR candidates. Known hero, service, and component images remain metadata-only.'], summary: { assets: assetCount, byDataType: counts, extractionCandidates: { pdfText: counts.policy_document || 0, imageOcr: counts.informational_graphic_or_table || 0, metadataOnly: assetCount - (counts.policy_document || 0) - (counts.informational_graphic_or_table || 0) } }, records }
fs.writeFileSync(output, `${JSON.stringify(parsed, null, 2)}\n`)
console.log(JSON.stringify(parsed.summary, null, 2))
