import { describe, expect, it } from 'vitest'

import { auditCatalogProducts } from './audit'
import { CORE_SPEC_ALIASES, CORE_SPEC_DEFINITIONS } from './definitions'
import { canonicalProductType, extractProductSpecifications } from './extractors'
import { catalogInputHash } from './hash'
import { parseCanonicalValue } from './measurement-parser'
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

const registry = new SpecRegistry(CORE_SPEC_DEFINITIONS, CORE_SPEC_ALIASES)

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
  return { valueType: 'NUMBER', displayValue: `${value} ${unit}`, numericValue: value, textValue: null, booleanValue: null, durationSeconds: null, canonicalUnit: unit }
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
    expect(results['Màu sắc']).toEqual({ status: 'UNKNOWN_SPEC' })
  })

  it('types a primary measurement while preserving explicit source qualifiers', () => {
    const battery = registry.definition('battery_capacity_kwh')!
    const range = registry.definition('range_km')!
    const charging = registry.definition('charging_time')!

    expect(parseCanonicalValue('1.5 kWh (Tùy chọn thêm 1 pin 1.5 kWh)', battery)).toMatchObject({ ok: true, value: { numericValue: 1.5 } })
    expect(parseCanonicalValue('Khoảng 134 km (+128 km khi lắp thêm pin phụ)', range)).toMatchObject({ ok: true, value: { numericValue: 134 } })
    expect(parseCanonicalValue('Khoảng 4h30 phút từ 0-100%', charging)).toMatchObject({ ok: true, value: { durationSeconds: 16_200 } })
    expect(parseCanonicalValue('Sạc 220W - 10h đạt 100%', charging)).toMatchObject({ ok: true, value: { durationSeconds: 36_000 } })
    expect(parseCanonicalValue('30 phút (10%-70%)', charging)).toMatchObject({ ok: true, value: { durationSeconds: 1_800 } })
    expect(parseCanonicalValue('Khoảng 9 giờ; khoảng 3,5 giờ nếu dùng sạc 1000 W', charging)).toMatchObject({ ok: false })
  })

  it('fails closed for multiple numeric quantities and incompatible units', () => {
    const range = registry.definition('range_km')!
    expect(parseCanonicalValue('450 - 471 km', range)).toMatchObject({ ok: false })
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

  it('hashes canonical JSON independently of object key order and includes extractor version', () => {
    expect(catalogInputHash({ b: 2, a: 1 })).toBe(catalogInputHash({ a: 1, b: 2 }))
    expect(catalogInputHash({ a: 1 }, 'extractor-v1')).not.toBe(catalogInputHash({ a: 1 }, 'extractor-v2'))
  })

  it('produces byte-stable dry-run audit output for the same input', () => {
    const first = auditCatalogProducts([motorbike, car])
    const second = auditCatalogProducts([car, motorbike])

    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    expect(first).toMatchObject({ mode: 'DRY_RUN', products: 2, writes: 0, ambiguous: 0 })
    expect(first.unknown).toBeGreaterThan(0)
  })
})
