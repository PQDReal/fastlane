import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const extracted = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/after-sales-extracted.json'), 'utf8'))
const normalized = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/after-sales-normalized.json'), 'utf8'))
const reportPath = path.join(ROOT, '.local/after-sales/semantic-phrase-coverage-report.json')

const rules = [
  {
    id: 'yearly_interval',
    pattern: /\b(?:(?:định\s+kỳ\s+)?(?:hàng|hằng)\s+năm|mỗi\s+năm(?:\s+một\s+lần)?)\b/giu,
    policy: 'must_represent',
    mapping: 'maintenance_interval_time / 1 year',
  },
  {
    id: 'monthly_interval',
    pattern: /\b(?:(?:định\s+kỳ\s+)?(?:hàng|hằng)\s+tháng|mỗi\s+tháng(?:\s+một\s+lần)?)\b/giu,
    policy: 'must_represent',
    mapping: 'maintenance_interval_time / 1 month',
  },
  {
    id: 'daily_interval',
    pattern: /\b(?:(?:định\s+kỳ\s+)?(?:hàng|hằng)\s+ngày|mỗi\s+ngày(?:\s+một\s+lần)?)\b/giu,
    policy: 'must_represent',
    mapping: 'maintenance_interval_time / 1 day',
  },
  {
    id: 'unlimited_distance',
    pattern: /không\s+giới\s+hạn\s+(?:quãng\s+đường|số\s+km|km)/giu,
    policy: 'must_represent',
    mapping: 'distancePolicy or intervalGroupDistancePolicy / unlimited',
  },
  {
    id: 'first_service',
    pattern: /(?:bảo\s+dưỡng\s+lần\s+đầu|lần\s+đầu\s+tiên)/giu,
    policy: 'must_represent',
    mapping: 'action or subject / first_service',
  },
  {
    id: 'each_maintenance',
    pattern: /mỗi\s+lần\s+bảo\s+dưỡng/giu,
    policy: 'must_review',
    mapping: 'maintenance trigger qualifier not yet modeled',
  },
  {
    id: 'not_applicable',
    pattern: /không\s+áp\s+dụng/giu,
    policy: 'must_review',
    mapping: 'coverage exclusion not yet modeled as a fact',
  },
  {
    id: 'lifetime',
    pattern: /trọn\s+đời/giu,
    policy: 'must_review',
    mapping: 'lifetime duration not yet modeled',
  },
  {
    id: 'real_condition',
    pattern: /theo\s+tình\s+trạng\s+thực\s+tế/giu,
    policy: 'must_review',
    mapping: 'condition-based trigger not yet modeled',
  },
  {
    id: 'when_needed',
    pattern: /khi\s+cần\s+thiết/giu,
    policy: 'must_review',
    mapping: 'condition-based trigger not yet modeled',
  },
  {
    id: 'free_service',
    pattern: /miễn\s+phí/giu,
    policy: 'intentional_ignore',
    mapping: 'commercial qualifier; not materialized as numeric fact',
  },
]

function corpusFromExtracted(data) {
  const entries = []
  for (const source of data.records || []) {
    if (source.text) entries.push({ sourceId: source.sourceId, origin: 'snapshot_page_text', text: source.text })
    for (const asset of source.assets || []) {
      if (asset.extraction?.text) entries.push({ sourceId: source.sourceId, origin: asset.extraction.method || 'asset_extraction', text: asset.extraction.text })
    }
  }
  return entries
}

const corpus = corpusFromExtracted(extracted)
const facts = normalized.facts || []
const results = rules.map(rule => {
  const occurrences = []
  for (const entry of corpus) {
    rule.pattern.lastIndex = 0
    for (const match of entry.text.matchAll(rule.pattern)) {
      occurrences.push({ sourceId: entry.sourceId, origin: entry.origin, text: match[0], index: match.index })
    }
  }
  const representedBy = facts
    .filter(fact => (fact.provenances || []).some(provenance => {
      rule.pattern.lastIndex = 0
      return rule.pattern.test(provenance.excerpt || '')
    }))
    .map(fact => fact.factId)
  let status = 'not_detected'
  if (occurrences.length) {
    if (rule.policy === 'intentional_ignore') status = 'intentionally_ignored'
    else if (representedBy.length) status = 'represented'
    else status = 'unsupported'
  }
  return {
    id: rule.id,
    policy: rule.policy,
    mapping: rule.mapping,
    occurrenceCount: occurrences.length,
    sourceIds: [...new Set(occurrences.map(item => item.sourceId))],
    representedFactIds: [...new Set(representedBy)],
    status,
    samples: occurrences.slice(0, 5),
  }
})

const summary = Object.fromEntries(['represented', 'intentionally_ignored', 'unsupported', 'not_detected'].map(status => [
  status,
  results.filter(result => result.status === status).length,
]))
const output = {
  auditVersion: 'after-sales-semantic-phrase-coverage-v1',
  auditedAt: new Date().toISOString(),
  corpusEntries: corpus.length,
  rules: results.length,
  summary,
  decision: results.some(result => result.status === 'unsupported') ? 'REVIEW' : 'PASS',
  results,
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true })
fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify({ ...summary, decision: output.decision }, null, 2))
