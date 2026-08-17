export function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function identityPart(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi-VN')
    .replace(/\u0111/g, 'd')
    .replace(/\s+/g, ' ')
}

export function vehicleProductType(value) {
  return String(value ?? '').toUpperCase() === 'CAR' ? 'CAR' : 'BIKE'
}

export function vehicleConfigurationKey({ productId, version, color, interiorColor }) {
  return [productId, version, color, interiorColor]
    .map(identityPart)
    .join('\u001f')
}

export function vehicleInteriorColor(row) {
  return text(row?.interior_color) || text(row?.specs?.catalog?.interior_color)
}

export function vehicleVersionSku(row) {
  return text(row?.specs?.catalog?.version_sku)
    || text(row?.metadata?.base_sku)
    || text(row?.version)
}

export function isCanonicalVehicleSku(value, productType) {
  const sku = text(value).toUpperCase()
  return vehicleProductType(productType) === 'CAR'
    ? /^CAR1[0-9]{7}$/.test(sku)
    : /^BIK2[0-9]{7}$/.test(sku)
}

export function assertCanonicalVehicleSku(value, productType, context = 'vehicle variant') {
  if (!isCanonicalVehicleSku(value, productType)) {
    throw new Error(`${context} must use a canonical ${vehicleProductType(productType)} SKU.`)
  }
  return text(value).toUpperCase()
}
