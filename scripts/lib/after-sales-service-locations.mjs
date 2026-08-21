import crypto from 'node:crypto'

export const SERVICE_LOCATION_CATEGORY_SLUGS = Object.freeze([
  'service_car',
  'service_car_partner',
  'service_escooter',
])

const RAW_FIELD_ALLOWLIST = Object.freeze([
  'entity_id',
  'name',
  'address',
  'code',
  'store_id',
  'lng',
  'lat',
  'hotline',
  'status',
  'province_id',
  'district_id',
  'type',
  'multiple_type',
  'category_name',
  'category_slug',
  'store_type',
  'store_model',
  'hotline_xdv',
  'open_time_service',
  'close_time_service',
  'get_direction',
  'button_action',
])

export function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`
}

export function isRetryableLocatorFetchError(error) {
  const status = Number(error?.status)
  if (status === 429 || status >= 500) return true
  const code = String(error?.code || error?.cause?.code || '').toUpperCase()
  if (['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'].includes(code)) {
    return true
  }
  const name = String(error?.name || '')
  if (['AbortError', 'TimeoutError'].includes(name)) return true
  return /\b(?:fetch failed|socket|terminated|timed?\s*out|connection reset)\b/iu.test(String(error?.message || ''))
}

export function parseLocatorSettings(html) {
  const match = String(html || '').match(/<script\b[^>]*data-drupal-selector=["']drupal-settings-json["'][^>]*>([\s\S]*?)<\/script>/iu)
  if (!match) throw new Error('Drupal locator settings were not found in the workshop snapshot')
  const settings = JSON.parse(match[1])
  if (!settings.locator?.cdn_base || !Array.isArray(settings.locator.categories)) {
    throw new Error('Workshop snapshot does not contain a usable locator configuration')
  }
  return settings.locator
}

function cleanString(value) {
  const result = String(value ?? '').normalize('NFC').replace(/\s+/gu, ' ').trim()
  return result || null
}

function cleanUrl(value) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

function cleanActions(actions) {
  if (!Array.isArray(actions)) return []
  return actions.flatMap(action => {
    const href = cleanUrl(action?.href)
    const title = cleanString(action?.title)
    return href && title ? [{ href, title }] : []
  })
}

export function projectRawServiceLocation(record) {
  const projected = {}
  for (const field of RAW_FIELD_ALLOWLIST) {
    if (record[field] === undefined) continue
    if (field === 'button_action') projected[field] = cleanActions(record[field])
    else if (field === 'multiple_type') projected[field] = Array.isArray(record[field]) ? record[field].map(String) : []
    else projected[field] = record[field]
  }
  projected.recordHash = sha256(JSON.stringify(projected))
  return projected
}

export function selectServiceLocationRecords(payload, locatorSettings) {
  const rows = Array.isArray(payload) ? payload : payload?.data
  if (!Array.isArray(rows)) throw new Error('Locator payload does not contain a data array')
  const allowedSlugs = new Set(SERVICE_LOCATION_CATEGORY_SLUGS)
  const allowedCategories = locatorSettings.categories.filter(category => allowedSlugs.has(category.slug))
  const allowedCategoryIds = new Set(allowedCategories.map(category => String(category.id)))
  if (allowedCategoryIds.size !== allowedSlugs.size) {
    throw new Error('Official locator categories do not contain every required service category')
  }
  const records = rows
    .filter(record => allowedCategoryIds.has(String(record.type)) && allowedSlugs.has(record.category_slug))
    .map(projectRawServiceLocation)
  return { records, categories: allowedCategories.map(({ id, name, slug }) => ({ id: String(id), name, slug })) }
}

function locationCategory(slug) {
  if (slug === 'service_car_partner') return 'partner_car_workshop'
  if (slug === 'service_escooter') return 'electric_motorbike_workshop'
  return 'official_car_workshop'
}

function vehicleTypes(slug) {
  return slug === 'service_escooter' ? ['motorbike'] : ['car']
}

function normalizeCoordinate(value, minimum, maximum) {
  const number = Number(value)
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null
}

function normalizePhone(value) {
  const phone = cleanString(value)
  return phone ? phone.replace(/[^+\d]/gu, '') || null : null
}

function normalizeRecordStatus(value) {
  const normalized = String(value ?? '').trim().toLocaleLowerCase('en')
  if (['1', 'true', 'active'].includes(normalized)) return 'active'
  if (['0', 'false', 'inactive'].includes(normalized)) return 'inactive'
  return 'unknown'
}

function bookableServiceTypes(actions) {
  const values = new Set()
  for (const action of actions || []) {
    if (/bảo dưỡng/iu.test(action.title || '')) values.add('maintenance')
    if (/sửa chữa/iu.test(action.title || '')) values.add('repair')
  }
  return [...values]
}

export function buildAdministrativeMaps(locatorSettings) {
  const provinces = new Map()
  const districts = new Map()
  for (const province of locatorSettings.cities || []) {
    provinces.set(String(province.id), cleanString(province.name))
    for (const district of province.districts || []) districts.set(String(district.id), cleanString(district.name))
  }
  return { provinces, districts }
}

export function normalizeServiceLocation(record, context) {
  const actions = cleanActions(record.button_action)
  const storeId = cleanString(record.store_id)
  const entityId = cleanString(record.entity_id)
  const upstreamId = storeId || entityId
  if (!upstreamId) throw new Error('Service location is missing both store_id and entity_id')
  const servicePhone = normalizePhone(record.hotline_xdv)
  const generalPhone = normalizePhone(record.hotline)
  return {
    id: `vinfast-service-location-${upstreamId}`,
    sourceSystem: 'VINFAST_OFFICIAL',
    upstreamIdentity: {
      storeId,
      entityId,
      code: cleanString(record.code),
    },
    name: cleanString(record.name),
    locationType: 'service_workshop',
    locationCategory: locationCategory(record.category_slug),
    categoryLabel: cleanString(record.category_name),
    vehicleTypes: vehicleTypes(record.category_slug),
    serviceTypes: ['general_after_sales'],
    bookableServiceTypes: bookableServiceTypes(actions),
    capabilityGranularity: 'location_category_only',
    address: {
      fullAddress: cleanString(record.address),
      provinceId: cleanString(record.province_id),
      province: context.administrativeMaps.provinces.get(String(record.province_id)) || null,
      districtId: cleanString(record.district_id),
      district: context.administrativeMaps.districts.get(String(record.district_id)) || null,
      latitude: normalizeCoordinate(record.lat, -90, 90),
      longitude: normalizeCoordinate(record.lng, -180, 180),
      directionsUrl: cleanUrl(record.get_direction),
    },
    contact: {
      servicePhone,
      generalPhone: generalPhone === servicePhone ? null : generalPhone,
    },
    serviceHours: {
      opensAt: cleanString(record.open_time_service),
      closesAt: cleanString(record.close_time_service),
      applicableDays: null,
    },
    bookingActions: actions,
    status: normalizeRecordStatus(record.status),
    statusBasis: 'official_locator_record',
    reviewStatus: 'not_started',
    evidence: {
      sourceUrl: context.sourceUrl,
      locatorDataUrl: context.locatorDataUrl,
      locatorGeneration: context.locatorGeneration,
      capturedAt: context.capturedAt,
      rawRecordHash: record.recordHash,
      upstreamStatus: cleanString(record.status),
    },
  }
}

export function containsSensitiveLocatorData(value) {
  return /incident_data_attributes|custom_url|\.my\.salesforce\.com|\/services\/data\/v\d+/iu.test(JSON.stringify(value))
}
