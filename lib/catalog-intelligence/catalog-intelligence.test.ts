import { describe, expect, it } from 'vitest'

import { auditCatalogProducts } from './audit'
import { CATALOG_SPEC_ALIASES, CATALOG_SPEC_DEFINITIONS } from './definitions'
import { canonicalProductType, extractProductSpecifications } from './extractors'
import { catalogInputHash, catalogSourceHash } from './hash'
import { parseCanonicalFacts, parseCanonicalValue } from './measurement-parser'
import { SpecRegistry } from './registry'
import { resolveRawSpec } from './resolver'
import { selectCanonicalFact } from './selection'
import type {
  CanonicalValue,
  CatalogProductInput,
  CurrentCanonicalFact,
  ResolvedSpecObservation,
  SpecAlias,
  SpecDefinition,
} from './types'

const registry = new SpecRegistry(CATALOG_SPEC_DEFINITIONS, CATALOG_SPEC_ALIASES)

const car: CatalogProductInput = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'VinFast VF 8',
  productType: 'CAR',
  specifications: {
    url: 'https://example.com/vf-8',
    specs: {
      Eco: {
        specs: {
          dimension: { length: '4.750 x 1.934 x 1.667 mm' },
          exterior: {},
          interior: { numberOfSeats: 5 },
          powertrain: {
            distance: '471 km (WLTP)',
            maxPower: '150 kW',
            maxTorque: '620 Nm',
            topSpeed: '200 km/h',
            batteryCapacity: '87,7 kWh',
            fastChargingTime: '30 phút',
            v2lPower: '3.5 kW',
          },
          safety: {},
        },
      },
    },
    marketing: { design: { title: 'Dấu ấn thời đại' } },
    gallery: { detail_images: ['https://example.com/image.jpg'] },
  },
}

const motorbike: CatalogProductInput = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Evo Test',
  productType: 'MOTORBIKE',
  specifications: {
    specs: {
      'Công suất tối đa': '3,500 W',
      'Dung lượng pin/ắc quy': '1,024 kWh',
      'Tốc độ tối đa': '70 km/h',
      'Quãng đường đi được mỗi lần sạc': 'Khoảng 160 km',
      'Thời gian sạc tiêu chuẩn': '4 giờ 30 phút',
      'Màu sắc': 'Đỏ',
    },
    marketing: { title: 'Không được extract' },
  },
}

function numberValue(value: number, unit: string): CanonicalValue {
  return { valueType: 'NUMBER', displayValue: `${value} ${unit}`, numericValue: value, numericUpperValue: null, numericTolerance: null, comparisonOperator: 'EQ', textValue: null, booleanValue: null, durationSeconds: null, canonicalUnit: unit }
}

function candidate(overrides: Partial<ResolvedSpecObservation> = {}): ResolvedSpecObservation {
  const definition = registry.definition('range_km')!
  return {
    observationId: 'observation-1',
    snapshotId: 'snapshot-1',
    snapshotCompleteness: 'FULL',
    observedAt: '2026-08-24T00:00:00.000Z',
    sourceAuthority: 'AUTO_EXTRACTED',
    productId: car.id,
    productName: car.name,
    productVariantId: null,
    sourceVariantKey: null,
    productType: 'CAR',
    sourceSchema: 'fastlane_car_nested_v1',
    sourcePath: 'specs.Eco.specs.powertrain.distance',
    rawKey: 'distance',
    rawValue: '471 km',
    sourceUri: 'https://example.com/vf-8',
    definition,
    value: numberValue(471, 'km'),
    qualifiers: [],
    contextKey: 'default',
    ...overrides,
  }
}

describe('catalog intelligence deterministic core', () => {
  it('normalizes legacy BIKE into the single MOTORBIKE product type', () => {
    expect(canonicalProductType('BIKE')).toBe('MOTORBIKE')
    expect(canonicalProductType('MOTORBIKE')).toBe('MOTORBIKE')
    expect(canonicalProductType('unknown')).toBeNull()
  })

  it('extracts only registered car technical zones and retains unknown technical fields', () => {
    const result = extractProductSpecifications(car)
    const paths = result.observations.map((item) => item.sourcePath)

    expect(paths).toContain('specs.Eco.specs.powertrain.distance')
    expect(paths).toContain('specs.Eco.specs.powertrain.v2lPower')
    expect(paths.some((path) => path.includes('marketing'))).toBe(false)
    expect(paths.some((path) => path.includes('gallery'))).toBe(false)
    expect(result.warnings).toEqual([])
  })

  it('uses path precedence and keeps unseen technical semantics as UNKNOWN_SPEC', () => {
    const extraction = extractProductSpecifications(car)
    const distance = extraction.observations.find((item) => item.sourcePath.endsWith('.distance'))!
    const v2l = extraction.observations.find((item) => item.sourcePath.endsWith('.v2lPower'))!

    expect(resolveRawSpec(distance, registry)).toMatchObject({
      status: 'RESOLVED',
      method: 'PATH',
      definition: { canonicalKey: 'range_km' },
      value: { numericValue: 471, canonicalUnit: 'km' },
    })
    expect(resolveRawSpec(v2l, registry)).toEqual({ status: 'UNKNOWN_SPEC' })
  })

  it('normalizes locale-sensitive power, energy, range and duration deterministically', () => {
    const extraction = extractProductSpecifications(motorbike)
    const results = Object.fromEntries(extraction.observations.map((raw) => [raw.rawKey, resolveRawSpec(raw, registry)]))

    expect(results['Công suất tối đa']).toMatchObject({ status: 'RESOLVED', value: { numericValue: 3.5, canonicalUnit: 'kW' } })
    expect(results['Dung lượng pin/ắc quy']).toMatchObject({ status: 'RESOLVED', value: { numericValue: 1.024, canonicalUnit: 'kWh' } })
    expect(results['Quãng đường đi được mỗi lần sạc']).toMatchObject({ status: 'RESOLVED', value: { numericValue: 160, canonicalUnit: 'km' } })
    expect(results['Thời gian sạc tiêu chuẩn']).toMatchObject({ status: 'RESOLVED', value: { durationSeconds: 16_200 } })
    expect(results['Màu sắc']).toMatchObject({ status: 'IGNORED', reasonCode: 'DUPLICATE_STRUCTURED_SOURCE' })
  })

  it('types a primary measurement while preserving explicit source qualifiers', () => {
    const battery = registry.definition('battery_capacity_kwh')!
    const range = registry.definition('range_km')!
    const charging = registry.definition('charging_time')!

    expect(parseCanonicalFacts('1.5 kWh (Tùy chọn thêm 1 pin 1.5 kWh)', battery)).toMatchObject({
      ok: true,
      facts: [{ value: { numericValue: 1.5 } }, { value: { numericValue: 3 } }],
    })
    expect(parseCanonicalFacts('Khoảng 134 km (+128 km khi lắp thêm pin phụ)', range)).toMatchObject({
      ok: true,
      facts: [
        { value: { numericValue: 134 }, qualifiers: expect.arrayContaining([{ key: 'auxiliary_battery_installed', value: false }]) },
        { value: { numericValue: 262 }, qualifiers: expect.arrayContaining([{ key: 'auxiliary_battery_installed', value: true }]) },
      ],
    })
    expect(parseCanonicalValue('Khoảng 4h30 phút từ 0-100%', charging)).toMatchObject({ ok: true, value: { durationSeconds: 16_200 } })
    expect(parseCanonicalValue('Sạc 220W - 10h đạt 100%', charging)).toMatchObject({ ok: true, value: { durationSeconds: 36_000 } })
    expect(parseCanonicalValue('30 phút (10%-70%)', charging)).toMatchObject({ ok: true, value: { durationSeconds: 1_800 } })
    expect(parseCanonicalFacts('Khoảng 9 giờ; khoảng 3,5 giờ nếu dùng sạc 1000 W', charging, { qualifiers: [{ key: 'charging_mode', value: 'STANDARD' }] })).toMatchObject({
      ok: true,
      facts: [
        { value: { durationSeconds: 32_400 }, qualifiers: [{ key: 'charging_mode', value: 'STANDARD' }] },
        { value: { durationSeconds: 12_600 }, qualifiers: [{ key: 'charger_power_w', value: 1000, unit: 'W' }] },
      ],
    })
  })

  it('keeps Kinet standard charging separate from the official 1000 W condition', () => {
    const input: CatalogProductInput = {
      id: '00000000-0000-4000-8000-000000000003',
      name: 'Kinet',
      productType: 'MOTORBIKE',
      specifications: {
        url: 'https://vinfastauto.com/vn_vi/xe-may-dien-vinfast-kinet',
        specs: { 'Thời gian sạc tiêu chuẩn': 'Khoảng 9 giờ; khoảng 3,5 giờ nếu dùng sạc 1000 W' },
      },
    }
    const raw = extractProductSpecifications(input).observations[0]
    const resolution = resolveRawSpec(raw, registry)

    expect(resolution).toMatchObject({
      status: 'RESOLVED',
      facts: [
        { value: { durationSeconds: 32_400 }, qualifiers: [{ key: 'charging_mode', value: 'STANDARD' }] },
        { value: { durationSeconds: 12_600 }, qualifiers: [{ key: 'charger_power_w', value: 1000, unit: 'W' }] },
      ],
    })
    if (resolution.status === 'RESOLVED') {
      expect(resolution.facts[0].qualifiers.some((qualifier) => qualifier.key === 'charger_power_w')).toBe(false)
      expect(resolution.facts[1].qualifiers.some((qualifier) => qualifier.key === 'charging_mode')).toBe(false)
    }
  })

  it('converts legacy unitless car maxPower horsepower instead of treating it as kW', () => {
    const raw = {
      ...extractProductSpecifications(car).observations.find((item) => item.sourcePath.endsWith('.maxPower'))!,
      rawValue: 134,
    }
    expect(resolveRawSpec(raw, registry)).toMatchObject({
      status: 'RESOLVED',
      value: { numericValue: 99.923782848, canonicalUnit: 'kW' },
    })
  })

  it('fails closed for multiple numeric quantities and incompatible units', () => {
    const range = registry.definition('range_km')!
    expect(parseCanonicalValue('450 - 471 km', range)).toMatchObject({ ok: true, value: { numericValue: 450, numericUpperValue: 471, comparisonOperator: 'RANGE' } })
    expect(parseCanonicalValue('200 kW', range)).toMatchObject({ ok: false })
    expect(parseCanonicalValue('471', range)).toMatchObject({ ok: false })
    expect(parseCanonicalValue('471', range, { allowImplicitCanonicalUnit: true })).toMatchObject({ ok: true, value: { numericValue: 471 } })
  })

  it('reports an ambiguous alias instead of guessing', () => {
    const definitions: SpecDefinition[] = [
      { canonicalKey: 'first', labelVi: 'Một', valueType: 'NUMBER', unitDimension: 'COUNT', canonicalUnit: 'seat', sortable: false, searchable: true },
      { canonicalKey: 'second', labelVi: 'Hai', valueType: 'NUMBER', unitDimension: 'COUNT', canonicalUnit: 'seat', sortable: false, searchable: true },
    ]
    const aliases: SpecAlias[] = [
      { definitionKey: 'first', alias: 'Số lượng', productType: 'CAR', sourceSchema: '*', matchKind: 'LABEL' },
      { definitionKey: 'second', alias: 'Số lượng', productType: 'CAR', sourceSchema: '*', matchKind: 'LABEL' },
    ]
    const ambiguousRegistry = new SpecRegistry(definitions, aliases)
    const raw = { ...extractProductSpecifications(car).observations[0], sourcePath: 'unknown.path', rawKey: 'Số lượng', rawValue: 5 }

    expect(resolveRawSpec(raw, ambiguousRegistry)).toEqual({ status: 'AMBIGUOUS', candidateKeys: ['first', 'second'] })
  })

  it('keeps verified facts and emits a conflict for changed observations', () => {
    const current: CurrentCanonicalFact = {
      observationId: 'verified-observation',
      definitionKey: 'range_km',
      value: numberValue(450, 'km'),
      qualifiers: [],
      contextKey: 'default',
      verificationStatus: 'VERIFIED',
      sourceAuthority: 'MANUAL_VERIFIED',
      selectedAt: '2026-08-20T00:00:00.000Z',
    }

    expect(selectCanonicalFact(current, [candidate()])).toMatchObject({
      action: 'CONFLICT',
      selected: null,
      conflictingObservationIds: ['observation-1'],
    })
  })

  it('does not let a partial snapshot or lower authority overwrite a canonical fact', () => {
    const current: CurrentCanonicalFact = {
      observationId: 'current',
      definitionKey: 'range_km',
      value: numberValue(450, 'km'),
      qualifiers: [],
      contextKey: 'default',
      verificationStatus: 'AUTO',
      sourceAuthority: 'OFFICIAL_PRIMARY',
      selectedAt: '2026-08-20T00:00:00.000Z',
    }

    expect(selectCanonicalFact(current, [candidate({ snapshotCompleteness: 'PARTIAL', sourceAuthority: 'OFFICIAL_PRIMARY' })]).action).toBe('CONFLICT')
    expect(selectCanonicalFact(current, [candidate({ sourceAuthority: 'OFFICIAL_SECONDARY' })]).action).toBe('CONFLICT')
  })

  it('aggregates variant metrics using the definition policy within one complete snapshot', () => {
    const selected = selectCanonicalFact(null, [
      candidate({ observationId: 'eco', sourceVariantKey: 'Eco', value: numberValue(450, 'km') }),
      candidate({ observationId: 'plus', sourceVariantKey: 'Plus', value: numberValue(471, 'km') }),
    ])

    expect(selected).toMatchObject({ action: 'CREATE', selected: { observationId: 'plus' } })
  })

  it('requires callers to select each fact context independently', () => {
    const selected = selectCanonicalFact(null, [
      candidate({ observationId: 'standard', contextKey: '[standard]' }),
      candidate({ observationId: 'charger-1000w', contextKey: '[1000w]' }),
    ])

    expect(selected).toMatchObject({
      action: 'CONFLICT',
      reason: 'Selector chỉ chấp nhận observations của cùng một fact context.',
    })
  })

  it('hashes canonical JSON independently of object key order and includes extractor version', () => {
    expect(catalogInputHash({ b: 2, a: 1 })).toBe(catalogInputHash({ a: 1, b: 2 }))
    expect(catalogInputHash({ a: 1 }, 'extractor-v1')).not.toBe(catalogInputHash({ a: 1 }, 'extractor-v2'))
    expect(catalogSourceHash({ b: 2, a: 1 })).toBe(catalogSourceHash({ a: 1, b: 2 }))
  })

  it('produces byte-stable dry-run audit output for the same input', () => {
    const first = auditCatalogProducts([motorbike, car])
    const second = auditCatalogProducts([car, motorbike])

    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    expect(first).toMatchObject({ mode: 'DRY_RUN', products: 2, writes: 0, ambiguous: 0 })
    expect(first.unknown).toBeGreaterThan(0)
  })
})
