import { createClient } from '@supabase/supabase-js'

import {
  isCanonicalVehicleSku,
  text,
  vehicleConfigurationKey,
  vehicleInteriorColor,
} from './vehicle-variant-identity.mjs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
const [productResult, productVariantResult, vehicleResult] = await Promise.all([
  supabase
    .from('products')
    .select('id,name,slug,is_active,product_type')
    .in('product_type', ['BIKE', 'MOTORBIKE'])
    .eq('is_active', true)
    .order('name'),
  supabase
    .from('product_variants')
    .select('id,product_id,sku,is_active,metadata'),
  supabase
    .from('vehicle_variants')
    .select('id,product_id,product_variant_id,product_name,product_type,sku,version,color,interior_color,price,deposit_amount,image_car_url,image_color_url,is_active,specs')
    .eq('product_type', 'BIKE'),
])

for (const [label, result] of [
  ['products', productResult],
  ['product_variants', productVariantResult],
  ['vehicle_variants', vehicleResult],
]) {
  if (result.error) throw new Error(`Unable to inspect ${label}: ${result.error.message}`)
}

const products = productResult.data ?? []
const productVariants = productVariantResult.data ?? []
const vehicleRows = vehicleResult.data ?? []
const productById = new Map(products.map((product) => [product.id, product]))
const variantById = new Map(productVariants.map((variant) => [variant.id, variant]))
const errors = []
const summaries = []

for (const product of products) {
  const rows = vehicleRows.filter((row) => row.product_id === product.id)
  const configurationIds = new Set()
  let canonicalRows = 0
  let linkedRows = 0

  if (rows.length === 0) errors.push(`${product.name}: no vehicle variants`)
  for (const row of rows) {
    const context = `${product.name}/${row.version || row.id}/${row.color || 'no-color'}`
    const variant = row.product_variant_id ? variantById.get(row.product_variant_id) : null
    const configurationId = vehicleConfigurationKey({
      productId: row.product_id,
      version: row.version,
      color: row.color,
      interiorColor: vehicleInteriorColor(row),
    })
    if (configurationIds.has(configurationId)) errors.push(`${context}: duplicate configuration`)
    configurationIds.add(configurationId)

    if (!variant || variant.product_id !== product.id) {
      errors.push(`${context}: missing linked product_variant`)
    } else {
      linkedRows += 1
      if (variant.sku !== row.sku) errors.push(`${context}: product and vehicle SKU mismatch`)
    }
    if (!isCanonicalVehicleSku(row.sku, 'BIKE')) {
      errors.push(`${context}: legacy or invalid vehicle SKU ${row.sku || '(empty)'}`)
    } else {
      canonicalRows += 1
    }
    if (!text(row.specs?.catalog?.version_sku)) errors.push(`${context}: missing specs.catalog.version_sku`)
    if (!row.product_name?.trim() || !row.version?.trim() || !row.color?.trim()) {
      errors.push(`${context}: incomplete product/version/color metadata`)
    }
    if (!Number.isFinite(Number(row.price)) || !Number.isFinite(Number(row.deposit_amount))) {
      errors.push(`${context}: invalid price or deposit`)
    }
    const detailImages = row.specs?.catalog?.detail_image_urls
    if (detailImages !== undefined && (!Array.isArray(detailImages) || detailImages.length > 20)) {
      errors.push(`${context}: detail image library must contain at most 20 images`)
    }
  }

  summaries.push({
    product: product.name,
    versions: new Set(rows.map((row) => row.version).filter(Boolean)).size,
    colors: new Set(rows.map((row) => row.color).filter(Boolean)).size,
    configurations: rows.length,
    activeConfigurations: rows.filter((row) => row.is_active).length,
    linkedConfigurations: linkedRows,
    canonicalSkuConfigurations: canonicalRows,
  })
}

const unrelatedRows = vehicleRows.filter((row) => !productById.has(row.product_id))
if (unrelatedRows.length > 0) errors.push(`${unrelatedRows.length} BIKE rows do not match an active motorbike product`)

const report = {
  activeProducts: products.length,
  configurations: vehicleRows.length,
  activeConfigurations: vehicleRows.filter((row) => row.is_active).length,
  linkedConfigurations: vehicleRows.filter((row) => {
    const variant = variantById.get(row.product_variant_id)
    return variant?.product_id === row.product_id
  }).length,
  canonicalSkuConfigurations: vehicleRows.filter((row) => isCanonicalVehicleSku(row.sku, 'BIKE')).length,
  readyForRuntimeCutover: errors.length === 0,
  products: summaries,
  errors,
}

console.log(JSON.stringify(report, null, 2))
if (errors.length > 0) process.exitCode = 1
