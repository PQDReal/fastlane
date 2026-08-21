import assert from 'node:assert/strict'
import test from 'node:test'
import { buildEvidenceContext, reindexSerializedEvidenceContext } from './after-sales-evidence-context.mjs'
import { decomposeSemanticClause, detectSubjectHint } from './after-sales-semantic-clause.mjs'
import {
  inferBatteryChemistry,
  inferPolicySectionSubject,
  statementPrefixThroughValue,
  valueLocalRowPrefix,
} from './after-sales-statement-scope.mjs'
import {
  correctNormalizedDataset,
  extractMentionedModels,
  inferAssetModel,
} from './after-sales-normalized-corrector.mjs'

test('evidence context keeps exact source slices and UTF-16 offsets', () => {
  const source = 'Mục trước.\nBảo hành 3 năm hoặc 100.000 km tùy điều kiện đến trước.\n\nMục sau.'
  const value = '100.000 km'
  const index = source.indexOf(value)
  const context = buildEvidenceContext(source, index, value.length)
  assert.equal(context.excerpt, source.slice(context.index.excerptStart, context.index.excerptEnd))
  assert.equal(source.slice(context.index.matchStart, context.index.matchEnd), value)
  assert.equal(context.index.version, 'after-sales-evidence-context-v2')
  assert.equal(context.index.offsetBasis, 'source_text_utf16')
})

test('evidence context can carry a verified raw-source anchor', () => {
  const source = 'Bảo hành 8 năm hoặc 160.000 km.'
  const value = '8 năm'
  const context = buildEvidenceContext(source, source.indexOf(value), value.length, {
    sourceOffsetsVerified: true,
    sourceAnchor: { kind: 'raw_dom_text', snapshotVersion: 'after-sales-raw-v2', textHash: 'sha256:test' },
  })
  assert.equal(context.index.sourceOffsetsVerified, true)
  assert.deepEqual(context.index.sourceAnchor, {
    kind: 'raw_dom_text',
    snapshotVersion: 'after-sales-raw-v2',
    textHash: 'sha256:test',
  })
})

test('legacy rendered evidence is reindexed against its serialized excerpt', () => {
  const excerpt = 'Bảo hành 3 năm hoặc 40.000  km tùy điều kiện đến trước.'
  const repaired = reindexSerializedEvidenceContext(excerpt, '40.000 km', { sourceStart: 900, matchStart: 930 })
  assert.equal(repaired.matched, true)
  assert.equal(repaired.contextIndex.excerptEnd, excerpt.length)
  const match = excerpt.slice(repaired.contextIndex.matchStart, repaired.contextIndex.matchEnd)
  assert.equal(match.replace(/\s+/gu, ' '), '40.000 km')
  assert.equal(repaired.contextIndex.offsetBasis, 'serialized_excerpt_utf16')
  assert.equal(repaired.contextIndex.sourceOffsetsVerified, false)
})

test('semantic parser keeps qualifier, distance and component hints', () => {
  const statement = 'Bôi trơn cổ phốt sau 20.000 km, tùy điều kiện đến trước; bảo hành không giới hạn số km.'
  const parsed = decomposeSemanticClause(statement, '20.000 km')
  assert.equal(parsed.qualifierHint, 'whichever_comes_first')
  assert.equal(parsed.distancePolicyHint, 'unlimited')
  assert.equal(parsed.subjectHint, 'steering_head_bearing')
  assert.equal(detectSubjectHint('Kiểm tra ắc quy Lithium-ion'), 'battery')
})

test('semantic parser preserves non-numeric alternatives as structured event triggers', () => {
  const oil = decomposeSemanticClause(
    'Các dòng xe VinFast được khuyến cáo nên thay dầu động cơ mỗi năm 1 lần hoặc dựa vào cảnh báo mức dầu trên màn hình hiển thị.',
    'mỗi năm',
  )
  assert.deepEqual(oil.nonNumericAlternativeTriggers, [
    {
      type: 'event',
      code: 'dashboard_oil_level_warning',
      sourceText: 'dựa vào cảnh báo mức dầu trên màn hình hiển thị',
    },
  ])
  assert.deepEqual(oil.flags, ['NON_NUMERIC_ALTERNATIVE_TRIGGER'])

  const tire = decomposeSemanticClause(
    'Kiểm tra tình trạng lốp trước khi chạy hay kiểm tra áp suất lốp sau mỗi lần đổ xăng, hoặc ít nhất 1 lần 1 tháng.',
    '1 tháng',
  )
  assert.deepEqual(
    tire.nonNumericAlternativeTriggers.map((trigger) => trigger.code),
    ['after_refueling', 'before_driving'],
  )
  assert.deepEqual(tire.flags, ['NON_NUMERIC_ALTERNATIVE_TRIGGER'])
})

test('model parser emits middle items and keeps VF 8 distinct from All New', () => {
  assert.deepEqual(extractMentionedModels('Áp dụng cho VF 3, VF 7, VF 8, VF 9, VF 8 The All New.'), [
    'VF 8 The All New',
    'VF 3',
    'VF 7',
    'VF 8',
    'VF 9',
  ])
  assert.equal(inferAssetModel('https://example.test/VinFast_VF6_SUV_2023_Electric_VN_ERG.pdf'), 'VF 6')
})

test('corrector separates post-repair battery capacity floor from warranty eligibility', () => {
  const excerpt = 'VinFast sẽ sửa chữa hoặc thay thế trong phạm vi bảo hành của pin và đảm bảo dung lượng pin trên 70%.'
  const value = '70%'
  const matchStart = excerpt.indexOf(value)
  const provenance = {
    origin: 'asset_text_extraction',
    sourceId: 'vinfast-warranty-car',
    sourceUrl: 'https://vinfastauto.com/vn_vi/chinh-sach-bao-hanh-oto',
    snapshotHash: `sha256:${'d'.repeat(64)}`,
    capturedAt: '2026-08-20T00:00:00.000Z',
    assetUrl: 'https://static-cms-prod.vinfastauto.com/vf7-warranty.pdf',
    assetHash: `sha256:${'e'.repeat(64)}`,
    pdfPage: 7,
    extractionMethod: 'pdf_text_layer',
    extractionConfidence: 0.95,
    sourceValueText: value,
    excerpt,
    contextIndex: {
      version: 'after-sales-evidence-context-v2',
      offsetBasis: 'source_text_utf16',
      sourceOffsetsVerified: true,
      sourceAnchor: { kind: 'pdf_page_text', assetHash: `sha256:${'e'.repeat(64)}`, pdfPage: 7 },
      sourceStart: 0,
      sourceEnd: excerpt.length,
      excerptStart: 0,
      excerptEnd: excerpt.length,
      matchStart,
      matchEnd: matchStart + value.length,
    },
  }
  const fact = {
    factId: 'legacy-capacity-threshold',
    factGroupId: 'legacy-capacity-group',
    serviceType: 'warranty',
    vehicleType: 'car',
    powertrain: 'electric',
    model: 'VF 7',
    subject: 'battery',
    policyEntity: 'battery',
    batteryChemistry: 'unspecified',
    usageCondition: 'general',
    applicability: 'original_equipment',
    action: 'warranty_coverage',
    factType: 'battery_capacity_threshold',
    valueNumeric: 70,
    valueText: value,
    unit: 'percent',
    qualifier: 'minimum',
    intervalRelation: null,
    intervalGroupId: null,
    intervalGroupDistancePolicy: null,
    distancePolicy: 'not_stated',
    confidence: 0.82,
    reviewStatus: 'pending',
    semanticFlags: [],
    groupSemanticFlags: [],
    provenance,
    provenances: [provenance],
  }

  const corrected = correctNormalizedDataset({
    schemaVersion: 5,
    controlledFactTypes: ['battery_capacity_threshold'],
    facts: [fact],
  })
  assert.equal(corrected.facts[0].factType, 'battery_post_repair_capacity_floor')
  assert.equal(corrected.facts[0].action, 'post_repair_capacity_floor')
  assert(corrected.controlledFactTypes.includes('battery_post_repair_capacity_floor'))
})

test('corrector removes ungrounded fact and merges semantic duplicates', () => {
  const provenance = {
    origin: 'snapshot_page_text',
    sourceId: 'source',
    sourceUrl: 'https://example.test/source',
    snapshotHash: `sha256:${'a'.repeat(64)}`,
    capturedAt: '2026-08-18T00:00:00.000Z',
    assetUrl: null,
    assetHash: null,
    pdfPage: null,
    extractionMethod: 'browser_inner_text',
    extractionConfidence: null,
    excerpt: 'VF 7 và VF 8: bảo hành 3 năm không giới hạn số km.',
    contextIndex: { boundaryType: 'blank_line' },
  }
  const base = {
    factGroupId: 'legacy-group',
    serviceType: 'warranty',
    vehicleType: 'car',
    powertrain: 'all',
    model: 'VF 7',
    subject: 'accessory',
    policyEntity: 'accessory',
    usageCondition: 'general',
    applicability: 'general',
    action: 'warranty_coverage',
    factType: 'accessory_warranty_duration',
    valueNumeric: 3,
    valueText: '3 năm',
    unit: 'year',
    qualifier: null,
    intervalRelation: null,
    intervalGroupId: null,
    intervalGroupDistancePolicy: null,
    distancePolicy: 'not_stated',
    confidence: 0.8,
    reviewStatus: 'pending',
    semanticFlags: [],
    groupSemanticFlags: [],
    provenance,
    provenances: [provenance],
  }
  const input = {
    schemaVersion: 5,
    controlledFactTypes: ['accessory_warranty_duration'],
    facts: [
      { ...structuredClone(base), factId: 'legacy-a' },
      { ...structuredClone(base), factId: 'legacy-b', usageCondition: 'standard_use', distancePolicy: 'unlimited' },
      { ...structuredClone(base), factId: 'af_fact_7b3b4be95c210a257f40' },
    ],
  }
  const corrected = correctNormalizedDataset(input, { normalizedAt: '2026-08-19T00:00:00.000Z' })
  assert.equal(corrected.schemaVersion, 6)
  assert.equal(corrected.facts.length, 2)
  assert.deepEqual(corrected.facts.map((fact) => fact.model).sort(), ['VF 7', 'VF 8'])
  assert(corrected.facts.every((fact) => fact.powertrain === 'electric'))
  assert(corrected.facts.every((fact) => fact.distancePolicy === 'unlimited'))
  assert(corrected.facts.every((fact) => fact.usageCondition === 'standard_use'))
  assert(corrected.facts.every((fact) => fact.provenance.contextIndex.version === 'after-sales-evidence-context-v2'))
})

test('corrector preserves an already verified raw-source anchor', () => {
  const provenance = {
    origin: 'snapshot_page_text',
    sourceId: 'source',
    sourceUrl: 'https://example.test/source',
    snapshotHash: `sha256:${'c'.repeat(64)}`,
    capturedAt: '2026-08-18T00:00:00.000Z',
    assetUrl: null,
    assetHash: null,
    pdfPage: null,
    extractionMethod: 'browser_inner_text',
    extractionConfidence: null,
    excerpt: 'Bảo hành 8 năm hoặc 160.000 km.',
    contextIndex: {
      version: 'after-sales-evidence-context-v2',
      offsetBasis: 'source_text_utf16',
      sourceOffsetsVerified: true,
      sourceAnchor: { kind: 'raw_dom_text', snapshotVersion: 'after-sales-raw-v2', textHash: 'sha256:test' },
      sourceStart: 0,
      sourceEnd: 34,
      excerptStart: 0,
      excerptEnd: 34,
      matchStart: 10,
      matchEnd: 15,
      crossedFutureBoundary: false,
    },
  }
  const fact = {
    factId: 'raw-anchored-fact',
    factGroupId: 'raw-anchored-group',
    serviceType: 'warranty',
    vehicleType: 'car',
    powertrain: 'electric',
    model: 'VF 8',
    subject: 'vehicle',
    policyEntity: 'vehicle',
    usageCondition: 'standard_use',
    applicability: 'original_vehicle',
    action: 'warranty_coverage',
    factType: 'vehicle_warranty_duration',
    valueNumeric: 8,
    valueText: '8 năm',
    unit: 'year',
    qualifier: null,
    distancePolicy: 'not_stated',
    confidence: 0.9,
    reviewStatus: 'pending',
    semanticFlags: [],
    groupSemanticFlags: [],
    provenance,
    provenances: [provenance],
  }
  const corrected = correctNormalizedDataset({ schemaVersion: 5, facts: [fact] })
  assert.equal(corrected.normalizationBasis.rawCorpusAvailable, true)
  assert.equal(corrected.publicationStatus, 'pending_admin_approval')
  assert.equal(corrected.facts[0].provenance.contextIndex.sourceOffsetsVerified, true)
  assert.equal(corrected.facts[0].provenance.contextIndex.sourceAnchor.kind, 'raw_dom_text')
})

test('commercial-use words inside an exclusion do not flip standard-use policy', () => {
  const provenance = {
    origin: 'snapshot_page_text',
    sourceId: 'source',
    sourceUrl: 'https://example.test/source',
    snapshotHash: `sha256:${'b'.repeat(64)}`,
    capturedAt: '2026-08-18T00:00:00.000Z',
    assetUrl: null,
    assetHash: null,
    pdfPage: null,
    extractionMethod: 'browser_inner_text',
    extractionConfidence: null,
    excerpt: 'Ngoại trừ trường hợp sử dụng xe cho mục đích dịch vụ\nthương mại, pin được bảo hành 8 năm.',
    contextIndex: { boundaryType: 'blank_line' },
  }
  const fact = {
    factId: 'legacy-standard',
    factGroupId: 'legacy-group',
    serviceType: 'warranty',
    vehicleType: 'car',
    powertrain: 'all',
    model: 'VF 5',
    subject: 'battery',
    policyEntity: 'battery',
    usageCondition: 'commercial_use',
    applicability: 'original_equipment',
    action: 'warranty_coverage',
    factType: 'battery_warranty_duration',
    valueNumeric: 8,
    valueText: '8 năm',
    unit: 'year',
    qualifier: null,
    intervalRelation: null,
    intervalGroupId: null,
    intervalGroupDistancePolicy: null,
    distancePolicy: 'not_stated',
    confidence: 0.8,
    reviewStatus: 'pending',
    semanticFlags: [],
    groupSemanticFlags: [],
    provenance,
    provenances: [provenance],
  }
  const corrected = correctNormalizedDataset({
    schemaVersion: 5,
    controlledFactTypes: ['battery_warranty_duration'],
    facts: [fact],
  })
  assert.equal(corrected.facts[0].usageCondition, 'standard_use')
})

test('corrector preserves one fact group for enumerated maintenance checkpoints', () => {
  const provenance = {
    origin: 'snapshot_page_text',
    sourceId: 'maintenance',
    sourceUrl: 'https://example.test/maintenance',
    snapshotHash: `sha256:${'d'.repeat(64)}`,
    capturedAt: '2026-08-20T00:00:00.000Z',
    assetUrl: null,
    assetHash: null,
    pdfPage: null,
    extractionMethod: 'browser_inner_text',
    extractionConfidence: null,
    excerpt: 'Kiểm tra lốp tại các mốc 12 tháng, 24 tháng và 36 tháng.',
    contextIndex: { boundaryType: 'line_break' },
  }
  const base = {
    factGroupId: 'shared-maintenance-group',
    serviceType: 'maintenance',
    vehicleType: 'car',
    powertrain: 'petrol',
    model: 'Fadil',
    subject: 'tire',
    policyEntity: 'tire',
    usageCondition: 'general',
    applicability: 'general',
    action: 'inspect',
    factType: 'maintenance_interval_time',
    unit: 'month',
    qualifier: null,
    intervalRelation: null,
    intervalGroupId: null,
    distancePolicy: 'not_stated',
    confidence: 0.9,
    reviewStatus: 'pending',
    semanticFlags: [],
    groupSemanticFlags: [],
  }
  const facts = [12, 24, 36].map((value) => ({
    ...structuredClone(base),
    factId: `legacy-${value}`,
    valueNumeric: value,
    valueText: `${value} tháng`,
    provenance: { ...structuredClone(provenance), excerpt: `${value} tháng` },
    provenances: [{ ...structuredClone(provenance), excerpt: `${value} tháng` }],
  }))
  const corrected = correctNormalizedDataset({ schemaVersion: 5, facts })
  assert.equal(new Set(corrected.facts.map((fact) => fact.factGroupId)).size, 1)
})

test('statement scope does not borrow models or usage markers from a later warranty row', () => {
  const statement = [
    'Đối với xe được sử dụng ở điều kiện sử dụng tiêu chuẩn',
    'Fadil, Lux A 2.0, VF 8, VF 9: 10 năm hoặc 200.000 km',
    'VF 3, VF 5, VF 6, VF 7, VF e34: 8 năm hoặc 160.000 km',
    'Pin cao áp sử dụng cho mục đích dịch vụ thương mại: 3 năm hoặc 100.000 km',
  ].join(' | ')

  const firstDistance = statement.indexOf('200.000 km')
  const firstRow = valueLocalRowPrefix(statement, '200.000 km', {
    matchStart: firstDistance,
    matchEnd: firstDistance + '200.000 km'.length,
  })
  assert.match(firstRow, /Fadil/iu)
  assert.doesNotMatch(firstRow, /VF 3|dịch vụ thương mại/iu)

  const secondDuration = statement.indexOf('8 năm')
  const secondRow = valueLocalRowPrefix(statement, '8 năm', {
    matchStart: secondDuration,
    matchEnd: secondDuration + '8 năm'.length,
  })
  assert.match(secondRow, /VF 3/iu)
  assert.doesNotMatch(secondRow, /Fadil|dịch vụ thương mại/iu)

  const prefix = statementPrefixThroughValue(statement, '160.000 km', {
    matchStart: statement.indexOf('160.000 km'),
    matchEnd: statement.indexOf('160.000 km') + '160.000 km'.length,
  })
  assert.doesNotMatch(prefix, /dịch vụ thương mại/iu)
})

test('row scope retains a model prefix across comma-separated maintenance checkpoints', () => {
  const statement =
    'VinFast Lux A2.0, VinFast Lux SA2.0 và President: kiểm tra tại các mốc 12 tháng, 24 tháng và 36 tháng.'
  for (const value of ['12 tháng', '24 tháng', '36 tháng']) {
    const matchStart = statement.indexOf(value)
    const scope = valueLocalRowPrefix(statement, value, {
      matchStart,
      matchEnd: matchStart + value.length,
    })
    assert.match(scope, /Lux A2\.0/iu)
    assert.match(scope, /President/iu)
  }
})

test('row scope retains model context when a later threshold changes action', () => {
  const statement = 'Nước làm mát pin VF e34: kiểm tra hàng năm hoặc sau 12.000 km và thay mới sau 120 tháng.'
  const matchStart = statement.indexOf('120 tháng')
  const scope = valueLocalRowPrefix(statement, '120 tháng', {
    matchStart,
    matchEnd: matchStart + '120 tháng'.length,
  })
  assert.match(scope, /VF e34/iu)
  assert.match(scope, /thay mới sau 120 tháng/iu)
})

test('row scope selects the nearest model cluster instead of document-navigation models', () => {
  const statement = [
    'Sổ bảo hành VF 3 Sổ bảo hành VF 5 Sổ bảo hành Fadil Sổ bảo hành VF MPV 7',
    'HƯỚNG DẪN SỬ DỤNG Ô TÔ Phụ tùng xe mới bảo hành giới hạn Pin cao áp',
    'Pin cao áp mua theo xe mới, sử dụng tiêu chuẩn: VF 8, VF 9, Lạc Hồng 900 LX: 10 năm',
  ].join(' ')
  const matchStart = statement.indexOf('10 năm')
  const scope = valueLocalRowPrefix(statement, '10 năm', {
    matchStart,
    matchEnd: matchStart + '10 năm'.length,
  })
  assert.match(scope, /VF 8, VF 9, Lạc Hồng 900 LX/iu)
  assert.doesNotMatch(scope, /VF 3|VF 5|Fadil|VF MPV 7/iu)
})

test('battery chemistry separates LFP and non-LFP warranty policies', () => {
  assert.equal(inferBatteryChemistry('Pin LFP: thời hạn bảo hành 8 năm'), 'lfp')
  assert.equal(inferBatteryChemistry('Pin khác (không phải pin LFP): bảo hành 3 năm'), 'non_lfp')
  assert.equal(inferBatteryChemistry('Pin có thời hạn bảo hành 4 năm'), 'unspecified')
})

test('flattened warranty page keeps vehicle and high-voltage battery sections separate', () => {
  const vehicleSection = 'Thời hạn bảo hành ô tô Đối với xe được sử dụng ở điều kiện sử dụng tiêu chuẩn:'
  assert.equal(inferPolicySectionSubject(vehicleSection), 'vehicle')

  const batterySection =
    `${vehicleSection} VF 3: 7 năm hoặc 160.000 km. ` +
    'Phụ tùng xe mới bảo hành giới hạn Pin cao áp ' +
    'Pin cao áp mua theo xe mới, sử dụng tiêu chuẩn:'
  assert.equal(inferPolicySectionSubject(batterySection), 'battery')

  const replacementBatterySection =
    'Bảo hành phụ tùng thay thế chính hãng ' + 'Phụ tùng không bao gồm pin: 2 năm. PIN:'
  assert.equal(inferPolicySectionSubject(replacementBatterySection), 'battery')
})

test('corrector separates replacement LFP battery rows from ordinary replacement parts', () => {
  const makeFact = ({ factId, valueNumeric, excerpt }) => {
    const provenance = {
      origin: 'snapshot_page_text',
      sourceId: 'vinfast-warranty-motorbike',
      sourceUrl: 'https://example.test/warranty-motorbike',
      snapshotHash: `sha256:${'d'.repeat(64)}`,
      capturedAt: '2026-08-20T00:00:00.000Z',
      assetUrl: null,
      assetHash: null,
      pdfPage: null,
      extractionMethod: 'browser_inner_text',
      extractionConfidence: null,
      excerpt,
      contextIndex: { boundaryType: 'line_break' },
    }
    return {
      factId,
      factGroupId: `${factId}-group`,
      serviceType: 'warranty',
      vehicleType: 'motorbike',
      powertrain: 'all',
      model: null,
      subject: 'replacement_part',
      batteryChemistry: 'not_applicable',
      policyEntity: 'replacement_part',
      usageCondition: 'general',
      applicability: 'customer_paid_replacement',
      action: 'warranty_coverage',
      factType: 'replacement_part_warranty_duration',
      valueNumeric,
      valueText: `${valueNumeric} năm`,
      unit: 'year',
      qualifier: null,
      intervalRelation: null,
      intervalGroupId: null,
      intervalGroupDistancePolicy: null,
      distancePolicy: 'unlimited',
      confidence: 0.88,
      reviewStatus: 'pending',
      semanticFlags: [],
      groupSemanticFlags: [],
      provenance,
      provenances: [provenance],
    }
  }
  const corrected = correctNormalizedDataset({
    schemaVersion: 5,
    facts: [
      makeFact({ factId: 'part', valueNumeric: 1, excerpt: 'Phụ tùng (không bao gồm pin và ắc quy 12V): 1 năm.' }),
      makeFact({ factId: 'non-lfp', valueNumeric: 3, excerpt: 'Pin khác (không phải pin LFP): 3 năm.' }),
      makeFact({ factId: 'lfp', valueNumeric: 8, excerpt: 'Pin LFP: 8 năm.' }),
    ],
  })
  const replacementPart = corrected.facts.find((fact) => fact.valueNumeric === 1)
  const nonLfp = corrected.facts.find((fact) => fact.valueNumeric === 3)
  const lfp = corrected.facts.find((fact) => fact.valueNumeric === 8)
  assert.equal(replacementPart.subject, 'replacement_part')
  assert.equal(nonLfp.subject, 'battery')
  assert.equal(nonLfp.batteryChemistry, 'non_lfp')
  assert.equal(nonLfp.factType, 'battery_warranty_duration')
  assert.equal(lfp.subject, 'battery')
  assert.equal(lfp.batteryChemistry, 'lfp')
  assert.equal(lfp.factType, 'battery_warranty_duration')
  assert.equal(nonLfp.usageCondition, 'general')
  assert.equal(lfp.usageCondition, 'general')
})
