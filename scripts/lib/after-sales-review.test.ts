// @ts-nocheck
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  applyApprovalCommand,
  stableAssetId,
  stableEvidenceId,
} from './after-sales-approval.mjs'
import { buildReviewDataset } from './after-sales-review-dataset.mjs'
import { buildImportPlan } from './after-sales-importer.mjs'
import { buildEvidenceContext } from './after-sales-evidence-context.mjs'
import { decomposeSemanticClause } from './after-sales-semantic-clause.mjs'
import { detectSemanticConflicts } from './after-sales-persistence-audit.mjs'

const ROOT = process.cwd()
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'))
const normalized = read('public/data/after-sales-normalized.json')
const verified = read('public/data/after-sales-verified.json')
const manifest = read('scripts/data/after-sales-source-manifest.json')
const verifiedAssetCount = new Set((verified.records || []).flatMap((source: any) =>
  (source.assets || []).map((asset: any) => `${source.sourceId}|${asset.url}|${asset.contentHash || asset.verification?.contentHash || ''}`),
)).size

function dataset(existing: any = null) {
  return buildReviewDataset({ normalized, verified, manifest, existing, generatedAt: '2026-08-19T00:00:00.000Z' })
}

describe('after-sales human approval and persistence contract', () => {
  it('keeps a same-action threshold pair together', () => {
    const statement = 'Tay phanh cần được bôi trơn sau mỗi 6 tháng hoạt động hay mỗi 5.000km di chuyển.'
    const first = decomposeSemanticClause(statement, '6 tháng')
    const second = decomposeSemanticClause(statement, '5.000km')

    expect(first).toMatchObject({ actionHint: 'lubricate', qualifierHint: null, intervalRelation: 'or', actionConflict: false })
    expect(second).toMatchObject({ actionHint: 'lubricate', qualifierHint: null, intervalRelation: 'or', actionConflict: false })
    expect(first.flags).toEqual([])
    expect(second.flags).toEqual([])
  })

  it('separates thresholds when the connector introduces a different action', () => {
    const statement = 'Tay phanh cần được bôi trơn sau mỗi 6 tháng hoặc thay mới mỗi 5.000km di chuyển.'
    const first = decomposeSemanticClause(statement, '6 tháng')
    const second = decomposeSemanticClause(statement, '5.000km')

    expect(first).toMatchObject({ actionHint: 'lubricate', qualifierHint: null, actionConflict: true })
    expect(second).toMatchObject({ actionHint: 'replace', qualifierHint: null, actionConflict: true })
    expect(first.flags).toEqual([])
    expect(second.flags).toEqual([])
    expect(first.groupSemanticFlags).toContain('MULTI_ACTION_CLAUSE')
    expect(second.groupSemanticFlags).toContain('MULTI_ACTION_CLAUSE')
  })

  it('does not treat an alternative service provider as a threshold qualifier', () => {
    const result = decomposeSemanticClause(
      'Đơn vị cứu hộ hoặc Xưởng dịch vụ bắt đầu di chuyển đến hiện trường trong 15 phút kể từ khi nhận yêu cầu.',
      '15 phút',
    )
    expect(result.qualifierHint).toBeNull()
    expect(result.flags).toEqual([])
  })

  it('flags both numeric facts when a later clause changes the action', () => {
    const statement = 'Nước làm mát pin được kiểm tra hàng năm hoặc sau mỗi 12.000km di chuyển và thay mới sau 120 tháng.'
    const inspect = decomposeSemanticClause(statement, '12.000km')
    const replace = decomposeSemanticClause(statement, '120 tháng')

    expect(inspect.flags).toEqual([])
    expect(replace.flags).toEqual([])
    expect(inspect.groupSemanticFlags).toContain('MULTI_ACTION_CLAUSE')
    expect(replace.groupSemanticFlags).toContain('MULTI_ACTION_CLAUSE')
    expect(inspect.actionHint).toBe('inspect')
    expect(replace.actionHint).toBe('replace')
  })

  it('flags a multi-action interval when no local action can bind it', () => {
    const result = decomposeSemanticClause(
      'Chu kỳ 12 tháng hoặc 12.000km và thay mới sau 120 tháng, cần kiểm tra lại.',
      '12 tháng',
    )
    expect(result.groupSemanticFlags).toContain('MULTI_ACTION_CLAUSE')
    expect(result.flags).toContain('ACTION_BINDING_AMBIGUOUS')
  })

  it('recognizes a non-numeric yearly interval and links same-action alternatives', () => {
    const statement = 'Nước làm mát pin được khuyến cáo kiểm tra hàng năm hoặc sau mỗi 12.000km di chuyển và thay mới sau 120 tháng.'
    const yearly = decomposeSemanticClause(statement, 'hàng năm')
    const distance = decomposeSemanticClause(statement, '12.000km')

    expect(yearly).toMatchObject({ actionHint: 'inspect', intervalRelation: 'or', qualifierHint: null })
    expect(distance).toMatchObject({ actionHint: 'inspect', intervalRelation: 'or', qualifierHint: null })
  })

  it('preserves an explicit whichever-comes-first qualifier with tuỳ spelling', () => {
    const statement = 'Bảo dưỡng lần đầu sau 12 tháng hoặc 12.000 km (tuỳ điều kiện đến trước).'
    const first = decomposeSemanticClause(statement, '12 tháng')
    expect(first.intervalRelation).toBe('or')
    expect(first.qualifierHint).toBe('whichever_comes_first')
    expect(normalized.facts.some((fact: any) => fact.action === 'first_service' && fact.qualifier === 'whichever_comes_first')).toBe(true)
  })

  it('emits three scoped facts for the coolant yearly-or-distance statement', () => {
    const coolant = normalized.facts.filter((fact: any) =>
      fact.subject === 'battery_coolant'
      && fact.model === 'VF e34'
      && fact.provenance.excerpt.includes('kiểm tra hàng năm hoặc sau mỗi 12.000km')
    )
    expect(coolant).toHaveLength(3)
    expect(coolant).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'inspect', factType: 'maintenance_interval_time', valueNumeric: 1, unit: 'year', intervalRelation: 'or', intervalGroupDistancePolicy: 'limited', distancePolicy: 'not_stated', qualifier: null }),
      expect.objectContaining({ action: 'inspect', factType: 'maintenance_interval_distance', valueNumeric: 12000, unit: 'km', intervalRelation: 'or', intervalGroupDistancePolicy: 'limited', distancePolicy: 'limited', qualifier: null }),
      expect.objectContaining({ action: 'replace', factType: 'maintenance_interval_time', valueNumeric: 120, unit: 'month', intervalRelation: null, intervalGroupId: null, intervalGroupDistancePolicy: null, distancePolicy: 'not_stated' }),
    ]))
    expect(coolant.every((fact: any) => Array.isArray(fact.groupSemanticFlags))).toBe(true)
    expect(coolant.every((fact: any) => fact.groupSemanticFlags.includes('MULTI_ACTION_CLAUSE'))).toBe(true)
    expect(coolant.every((fact: any) => !fact.semanticFlags.includes('MULTI_ACTION_CLAUSE'))).toBe(true)
    const inspect = coolant.filter((fact: any) => fact.action === 'inspect')
    expect(new Set(inspect.map((fact: any) => fact.intervalGroupId)).size).toBe(1)
    expect(inspect[0].intervalGroupId).toBeTruthy()
  })

  it('keeps the specific first-service action when the clause also contains a generic maintenance verb', () => {
    const firstServiceFacts = normalized.facts.filter((fact: any) => fact.subject === 'first_service')
    expect(firstServiceFacts.some((fact: any) => fact.valueNumeric === 12 && fact.unit === 'month' && fact.action === 'first_service')).toBe(true)
    expect(firstServiceFacts.some((fact: any) => fact.valueNumeric === 12000 && fact.unit === 'km' && fact.action === 'first_service')).toBe(true)
  })

  it('keeps petrol and electric 12V warranty scopes separate', () => {
    const batteryFacts = normalized.facts.filter((fact: any) => fact.subject === 'battery_12v' && fact.provenance.origin === 'snapshot_page_text')
    const petrol = batteryFacts.filter((fact: any) => fact.powertrain === 'petrol')
    const electric = batteryFacts.filter((fact: any) => fact.powertrain === 'electric')

    expect(petrol.some((fact: any) => fact.valueNumeric === 1 && fact.unit === 'year' && fact.distancePolicy === 'not_stated' && fact.intervalGroupDistancePolicy === 'limited' && fact.qualifier === 'whichever_comes_first')).toBe(true)
    expect(petrol.some((fact: any) => fact.valueNumeric === 20000 && fact.unit === 'km' && fact.distancePolicy === 'limited')).toBe(true)
    expect(electric.length).toBeGreaterThan(0)
    expect(electric.every((fact: any) => fact.valueNumeric === 1 && fact.unit === 'year' && fact.distancePolicy === 'unlimited' && fact.qualifier === null)).toBe(true)
    expect(electric.every((fact: any) => fact.provenances.some((item: any) => item.excerpt.includes('Ô tô điện: 1 năm')))).toBe(true)
  })

  it('bounds evidence at the current sentence/block and never borrows the next context', () => {
    const text = 'Hệ thống phanh cần kiểm tra sau 1.000 km.\n\nĐoạn sau không phải bằng chứng của fact này.'
    const match = /1\.000 km/u.exec(text)!
    const context = buildEvidenceContext(text, match.index!, match[0].length, { lineBreaksAreBoundaries: true })
    expect(context.excerpt).toBe('Hệ thống phanh cần kiểm tra sau 1.000 km.')
    expect(context.excerpt).not.toContain('Đoạn sau')
    expect(context.index.crossedFutureBoundary).toBe(false)
    expect(context.index.boundaryType).toBe('document_start')
    expect(context.index.version).toBe('after-sales-evidence-context-v2')
    expect(context.index.offsetBasis).toBe('source_text_utf16')
    expect(context.excerpt).toBe(text.slice(context.index.excerptStart, context.index.excerptEnd))
    expect(text.slice(context.index.matchStart, context.index.matchEnd)).toBe('1.000 km')
  })

  it('uses a controlled overshoot for long sentences but keeps the numeric match indexed', () => {
    const text = `Mục cần kiểm tra ${'nội dung liên quan '.repeat(50)} sau 12.000 km. Phần sau không phải bằng chứng.`
    const match = /12\.000 km/u.exec(text)!
    const context = buildEvidenceContext(text, match.index!, match[0].length)
    expect(context.index.clipped).toBe(true)
    expect(context.index.matchStart).toBe(match.index)
    expect(context.index.matchEnd).toBe(match.index! + match[0].length)
    expect(context.excerpt).toContain('12.000 km')
    expect(context.excerpt).not.toContain('phần sau')
  })

  it('supports pending → approved and records reviewer identity/timestamp', () => {
    const result = applyApprovalCommand(
      { status: 'pending' },
      { status: 'approved', reviewerId: 'reviewer-1', reviewedAt: '2026-08-19T01:00:00.000Z', note: 'Đã đối chiếu nguồn chính thức.' },
    )
    expect(result.current).toMatchObject({
      status: 'approved',
      reviewerId: 'reviewer-1',
      approvedBy: 'reviewer-1',
      approvedAt: '2026-08-19T01:00:00.000Z',
    })
    expect(result.history).toMatchObject({ fromStatus: 'pending', toStatus: 'approved' })
  })

  it('requires reviewer identity for approval or rejection', () => {
    expect(() => applyApprovalCommand({ status: 'pending' }, { status: 'rejected' })).toThrow(/reviewerId is required/)
  })

  it('supports approved → superseded and approved → revoked lifecycle transitions', () => {
    const superseded = applyApprovalCommand(
      { status: 'approved', reviewerId: 'reviewer-1', reviewedAt: '2026-08-19T01:00:00.000Z' },
      { status: 'superseded', reviewerId: 'reviewer-2', reviewedAt: '2026-08-19T02:00:00.000Z', note: 'Nguồn mới thay thế.' },
    )
    const revoked = applyApprovalCommand(
      { status: 'approved', reviewerId: 'reviewer-1', reviewedAt: '2026-08-19T01:00:00.000Z' },
      { status: 'revoked', reviewerId: 'reviewer-2', reviewedAt: '2026-08-19T02:00:00.000Z', note: 'Nguồn không còn hiệu lực.' },
    )
    expect(superseded.current.status).toBe('superseded')
    expect(revoked.current.status).toBe('revoked')
  })

  it('does not reopen terminal approval states or silently revert approved facts', () => {
    expect(() => applyApprovalCommand(
      { status: 'approved', reviewerId: 'reviewer-1', reviewedAt: '2026-08-19T01:00:00.000Z' },
      { status: 'pending', reviewerId: 'reviewer-3', reviewedAt: '2026-08-19T03:00:00.000Z' },
    )).toThrow(/Invalid approval transition/)
    expect(() => applyApprovalCommand(
      { status: 'superseded', reviewerId: 'reviewer-2', reviewedAt: '2026-08-19T02:00:00.000Z' },
      { status: 'approved', reviewerId: 'reviewer-3', reviewedAt: '2026-08-19T03:00:00.000Z' },
    )).toThrow(/Invalid approval transition/)
  })

  it('does not call enumerated checkpoints in one fact group a contradiction', () => {
    const base = {
      factId: 'fact-a', factGroupId: 'group-a', serviceType: 'maintenance', vehicleType: 'car',
      powertrain: 'all', model: 'all_models', subject: 'tire', usageCondition: 'general',
      applicability: 'general', action: 'inspect', factType: 'maintenance_interval_time',
      valueNumeric: 12, unit: 'month', qualifier: null, distancePolicy: 'not_stated', intervalRelation: null,
    }
    expect(detectSemanticConflicts([base, { ...base, factId: 'fact-b', valueNumeric: 24 }])).toEqual([])
    expect(detectSemanticConflicts([
      base,
      { ...base, factId: 'fact-b', factGroupId: 'group-b', valueNumeric: 24 },
    ])).toHaveLength(1)
    expect(detectSemanticConflicts([
      { ...base, factId: 'fact-recurring', factGroupId: 'group-recurring', valueNumeric: 1, intervalRelation: 'or' },
      { ...base, factId: 'fact-scheduled', factGroupId: 'group-scheduled', valueNumeric: 24, intervalRelation: null },
    ])).toEqual([])
  })

  it('classifies official page/PDF and manual transcription conflicts for admin review', () => {
    const base = {
      factId: 'fact-page', factGroupId: 'group-page', serviceType: 'warranty', vehicleType: 'car',
      powertrain: 'electric', model: 'VF 5', subject: 'vehicle', usageCondition: 'standard_use',
      applicability: 'original_vehicle', action: 'warranty_coverage', factType: 'vehicle_warranty_duration',
      valueNumeric: 8, unit: 'year', intervalRelation: 'or',
      provenances: [{ origin: 'snapshot_page_text', sourceId: 'warranty', capturedAt: '2026-08-20T00:00:00.000Z' }],
    }
    const official = detectSemanticConflicts([
      base,
      {
        ...base,
        factId: 'fact-pdf',
        factGroupId: 'group-pdf',
        valueNumeric: 7,
        provenances: [{ origin: 'asset_text_extraction', sourceId: 'warranty', assetUrl: 'https://example.test/vf5.pdf' }],
      },
    ])[0]
    expect(official.type).toBe('OFFICIAL_PAGE_DOCUMENT_CONFLICT')
    expect(official.resolutionPolicy).toBe('admin_review_required_no_automatic_precedence')
    expect(official.candidates[1].assetNames).toEqual(['vf5.pdf'])

    const manual = detectSemanticConflicts([
      base,
      {
        ...base,
        factId: 'fact-manual',
        factGroupId: 'group-manual',
        valueNumeric: 7,
        provenances: [{ origin: 'manifest_transcription', sourceId: 'warranty' }],
      },
    ])[0]
    expect(manual.type).toBe('MANUAL_TRANSCRIPTION_CONFLICT')
  })

  it('preserves a rejection when the review dataset is rebuilt', () => {
    const first = dataset()
    const firstFact = first.facts[0]
    const withRejection = {
      ...first,
      facts: first.facts.map((fact: any) => fact.factId === firstFact.factId
        ? { ...fact, approval: { status: 'rejected', reviewerId: 'reviewer-2', reviewedAt: '2026-08-19T02:00:00.000Z', note: 'Cần reviewer kiểm tra lại.', approvedBy: null, approvedAt: null } }
        : fact),
    }
    const rebuilt = dataset(withRejection)
    expect(rebuilt.facts[0].approval).toMatchObject({ status: 'rejected', reviewerId: 'reviewer-2' })
  })

  it('keeps fact/evidence identity stable across identical pipeline reruns', () => {
    const first = dataset()
    const second = dataset()
    expect(first.facts.map((fact: any) => fact.factId)).toEqual(second.facts.map((fact: any) => fact.factId))
    expect(first.facts.flatMap((fact: any) => fact.evidence.map((item: any) => item.evidenceId)))
      .toEqual(second.facts.flatMap((fact: any) => fact.evidence.map((item: any) => item.evidenceId)))
  })

  it('preserves all provenance records and resolves PDF asset links', () => {
    const review = dataset()
    const evidence = review.facts.flatMap((fact: any) => fact.evidence)
    expect(review.sourceCount).toBe(manifest.sources.length)
    expect(review.assetCount).toBe(verifiedAssetCount)
    expect(review.factCount).toBe(normalized.facts.length)
    expect(review.evidenceCount).toBe(normalized.summary.evidenceCount)
    const expectedPdfEvidence = normalized.facts
      .flatMap((fact: any) => fact.provenances)
      .filter((item: any) => item.pdfPage !== null).length
    expect(evidence.filter((item: any) => item.pdfPage !== null)).toHaveLength(expectedPdfEvidence)
    expect(evidence.filter((item: any) => item.pdfPage !== null && item.assetId)).toHaveLength(expectedPdfEvidence)
    expect(evidence.every((item: any) => item.sourceValueText)).toBe(true)
    expect(evidence.every((item: any) => item.sourceUrl.startsWith('https://vinfastauto.com'))).toBe(true)
    expect(evidence.filter((item: any) => item.origin === 'snapshot_page_text').every((item: any) => ['after-sales-evidence-context-v1', 'after-sales-evidence-context-v2'].includes(item.contextIndex?.version))).toBe(true)
    const normalizedById = new Map(normalized.facts.map((fact: any) => [fact.factId, fact]))
    expect(review.facts.every((fact: any) => fact.batteryChemistry === (normalizedById.get(fact.factId)?.batteryChemistry || 'not_applicable'))).toBe(true)
    expect(review.facts.every((fact: any) => JSON.stringify(fact.sourceFactGroupIds) === JSON.stringify(normalizedById.get(fact.factId)?.sourceFactGroupIds || []))).toBe(true)
  })

  it('produces an insert-only dry-run plan for an empty database', () => {
    const plan = buildImportPlan(dataset())
    expect(plan.decision).toBe('READY')
    expect(plan.conflicts).toHaveLength(0)
    expect(plan.rejectedWrites).toHaveLength(0)
    expect(plan.writes).toBe(0)
    expect(plan.summary).toMatchObject({
      sources: { inserts: manifest.sources.length, updates: 0, unchanged: 0 },
      assets: { inserts: verifiedAssetCount, updates: 0, unchanged: 0 },
      facts: { inserts: normalized.facts.length, updates: 0, unchanged: 0 },
      evidence: { inserts: normalized.summary.evidenceCount, updates: 0, unchanged: 0 },
    })
  })

  it('reports unchanged rows when the same plan is imported twice', () => {
    const first = buildImportPlan(dataset())
    const existing = Object.fromEntries(Object.entries(first.tables).map(([table, plan]: [string, any]) => [
      table,
      plan.rows.map((entry: any) => entry.row),
    ]))
    const second = buildImportPlan(dataset(), existing)
    expect(second.conflicts).toHaveLength(0)
    expect(second.summary.sources).toMatchObject({ inserts: 0, updates: 0, unchanged: manifest.sources.length })
    expect(second.summary.facts).toMatchObject({ inserts: 0, updates: 0, unchanged: normalized.facts.length })
    expect(second.summary.evidence).toMatchObject({ inserts: 0, updates: 0, unchanged: normalized.summary.evidenceCount })
  })

  it('does not overwrite an existing approved fact during a pipeline re-import', () => {
    const first = buildImportPlan(dataset())
    const existing = Object.fromEntries(Object.entries(first.tables).map(([table, plan]: [string, any]) => [
      table,
      plan.rows.map((entry: any) => entry.row),
    ]))
    existing.facts[0] = {
      ...existing.facts[0],
      approval_status: 'approved',
      reviewer_id: 'reviewer-1',
      reviewed_at: '2026-08-19T03:00:00.000Z',
      approved_by: 'reviewer-1',
      approved_at: '2026-08-19T03:00:00.000Z',
      approval_note: 'Đã duyệt.',
    }
    const rerun = buildImportPlan(dataset(), existing)
    expect(rerun.conflicts).toHaveLength(0)
    expect(rerun.summary.facts).toMatchObject({ inserts: 0, updates: 0, unchanged: normalized.facts.length })
  })

  it('uses deterministic IDs for the same asset and evidence provenance', () => {
    const provenance = normalized.facts[0].provenances[0]
    expect(stableAssetId({ sourceId: 'source-a', url: 'https://example.com/a.pdf', contentHash: 'sha256:a' }))
      .toBe(stableAssetId({ sourceId: 'source-a', url: 'https://example.com/a.pdf', contentHash: 'sha256:a' }))
    expect(stableEvidenceId(provenance)).toBe(stableEvidenceId({ ...provenance }))
  })
})
