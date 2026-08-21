import assert from 'node:assert/strict'
import test from 'node:test'
import {
  containsSensitiveLocatorData,
  isRetryableLocatorFetchError,
  normalizeServiceLocation,
  projectRawServiceLocation,
  selectServiceLocationRecords,
} from './after-sales-service-locations.mjs'

test('retries only transient locator transport and server failures', () => {
  assert.equal(isRetryableLocatorFetchError({ cause: { code: 'UND_ERR_SOCKET' }, message: 'terminated' }), true)
  assert.equal(isRetryableLocatorFetchError({ status: 429 }), true)
  assert.equal(isRetryableLocatorFetchError({ status: 503 }), true)
  assert.equal(isRetryableLocatorFetchError({ status: 403, message: 'forbidden' }), false)
  assert.equal(isRetryableLocatorFetchError(new Error('invalid locator payload')), false)
})

const settings = {
  categories: [
    { id: '2473', name: 'Xưởng dịch vụ Ô tô', slug: 'service_car' },
    { id: '2479', name: 'Xưởng dịch vụ Ô tô - Đối Tác', slug: 'service_car_partner' },
    { id: '2474', name: 'Xưởng dịch vụ Xe máy điện', slug: 'service_escooter' },
  ],
  cities: [{ id: '1', name: 'Hà Nội', districts: [{ id: '2', name: 'Ba Đình' }] }],
}

const sourceRecord = {
  entity_id: '10',
  store_id: 'store-10',
  name: 'VinFast Test',
  address: '1 Test',
  type: '2473',
  category_name: 'Xưởng dịch vụ Ô tô',
  category_slug: 'service_car',
  province_id: '1',
  district_id: '2',
  lat: '21.03',
  lng: '105.85',
  status: '1',
  hotline_xdv: '0901 234 567',
  open_time_service: '08h00',
  close_time_service: '18h00',
  button_action: [{ href: 'https://shop.vinfastauto.com/vn_vi/dat-lich-dich-vu.html', title: 'Đặt lịch bảo dưỡng' }],
  incident_data_attributes: { custom_url: 'https://vhm.my.salesforce.com/internal' },
}

test('acquisition projection removes internal Salesforce fields', () => {
  const projected = projectRawServiceLocation(sourceRecord)
  assert.equal(projected.incident_data_attributes, undefined)
  assert.equal(containsSensitiveLocatorData(projected), false)
  assert.match(projected.recordHash, /^sha256:/u)
})

test('selection includes only approved service categories', () => {
  const payload = { data: [sourceRecord, { ...sourceRecord, type: '2480', category_slug: 'service_bus' }] }
  const selected = selectServiceLocationRecords(payload, settings)
  assert.equal(selected.records.length, 1)
})

test('normalization preserves evidence and does not overclaim capabilities', () => {
  const record = projectRawServiceLocation(sourceRecord)
  const normalized = normalizeServiceLocation(record, {
    sourceUrl: 'https://vinfastauto.com/vn_vi/tim-kiem-showroom-tram-sac',
    locatorDataUrl: 'https://static-cms-prod.vinfastauto.com/locators/locators-1.json.gz',
    locatorGeneration: 1,
    capturedAt: '2026-08-20T00:00:00.000Z',
    administrativeMaps: {
      provinces: new Map([['1', 'Hà Nội']]),
      districts: new Map([['2', 'Ba Đình']]),
    },
  })
  assert.deepEqual(normalized.vehicleTypes, ['car'])
  assert.deepEqual(normalized.serviceTypes, ['general_after_sales'])
  assert.deepEqual(normalized.bookableServiceTypes, ['maintenance'])
  assert.equal(normalized.status, 'active')
  assert.equal(normalized.statusBasis, 'official_locator_record')
  assert.equal(normalized.evidence.upstreamStatus, '1')
  assert.equal(normalized.reviewStatus, 'not_started')
})

test('unknown upstream activity is preserved instead of being mislabeled inactive', () => {
  const record = projectRawServiceLocation({ ...sourceRecord, status: 'pending-verification' })
  const normalized = normalizeServiceLocation(record, {
    sourceUrl: 'https://vinfastauto.com/vn_vi/tim-kiem-showroom-tram-sac',
    locatorDataUrl: 'https://static-cms-prod.vinfastauto.com/locators/locators-1.json.gz',
    locatorGeneration: 1,
    capturedAt: '2026-08-20T00:00:00.000Z',
    administrativeMaps: {
      provinces: new Map([['1', 'Hà Nội']]),
      districts: new Map([['2', 'Ba Đình']]),
    },
  })
  assert.equal(normalized.status, 'unknown')
})
