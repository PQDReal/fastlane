import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const reportPath = resolve(root, '.local', 'vehicle-sku-verification.json')
const clean = (value) => typeof value === 'string' ? value.trim() : ''
const canonical = (type, sku) => type === 'CAR' ? /^CAR1[0-9]{7}$/.test(sku) : /^BIK2[0-9]{7}$/.test(sku)
const prefix = (type) => type === 'CAR' ? 'CAR' : 'BIK'
const rangeStart = (type) => type === 'CAR' ? 10_000_000 : 20_000_000
const rangeEnd = (type) => type === 'CAR' ? 19_999_999 : 29_999_999

const [productsResult, variantsResult, vehiclesResult, inventoryResult] = await Promise.all([
  supabase.from('products').select('id,name,product_type').in('product_type', ['CAR', 'BIKE']).order('id'),
  supabase.from('product_variants').select('id,product_id,sku,name,is_active').order('product_id').order('id'),
  supabase.from('vehicle_variants').select('id,product_id,product_variant_id,product_type,sku,version,color,interior_color,is_active').in('product_type', ['CAR', 'BIKE']).order('product_id').order('id'),
  supabase.from('inventory_items').select('variant_id,on_hand_quantity,updated_at').order('variant_id'),
])
for (const [label, result] of [['products', productsResult], ['product_variants', variantsResult], ['vehicle_variants', vehiclesResult], ['inventory_items', inventoryResult]]) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`)
}

const products = productsResult.data ?? []
const productById = new Map(products.map((row) => [row.id, row]))
const variants = (variantsResult.data ?? []).filter((row) => productById.has(row.product_id))
const vehicles = vehiclesResult.data ?? []
const linkedVariantIds = new Set(vehicles.map((row) => row.product_variant_id).filter(Boolean))
const linkedVariants = variants.filter((row) => linkedVariantIds.has(row.id))
const orphanVariants = variants.filter((row) => !linkedVariantIds.has(row.id))
const inventoryByVariantId = new Map((inventoryResult.data ?? []).map((row) => [row.variant_id, row]))
const nextValue = { CAR: rangeStart('CAR'), BIKE: rangeStart('BIKE') }

for (const variant of variants) {
  const type = productById.get(variant.product_id).product_type
  const sku = clean(variant.sku).toUpperCase()
  if (canonical(type, sku)) nextValue[type] = Math.max(nextValue[type], Number(sku.slice(3)))
}
for (const vehicle of vehicles) {
  if (vehicle.product_variant_id) continue
  const type = vehicle.product_type === 'CAR' ? 'CAR' : 'BIKE'
  const sku = clean(vehicle.sku).toUpperCase()
  if (canonical(type, sku)) nextValue[type] = Math.max(nextValue[type], Number(sku.slice(3)))
}

const allocate = (type) => {
  nextValue[type] += 1
  if (nextValue[type] > rangeEnd(type)) throw new Error(`${type} SKU range is exhausted in the migration plan.`)
  return `${prefix(type)}${String(nextValue[type]).padStart(8, '0')}`
}

const variantPlans = linkedVariants.map((variant) => {
  const product = productById.get(variant.product_id)
  const type = product.product_type
  const currentSku = clean(variant.sku).toUpperCase()
  const plannedSku = canonical(type, currentSku) ? currentSku : allocate(type)
  const inventory = inventoryByVariantId.get(variant.id)
  return {
    productId: product.id,
    product: product.name,
    productType: type,
    variantId: variant.id,
    variant: variant.name,
    currentSku,
    plannedSku,
    changed: currentSku !== plannedSku,
    inventoryQuantity: Number(inventory?.on_hand_quantity ?? 0),
    inventoryUpdatedAt: inventory?.updated_at ?? null,
  }
})
const variantPlanById = new Map(variantPlans.map((row) => [row.variantId, row]))

const vehiclePlans = vehicles.map((vehicle) => {
  const type = vehicle.product_type === 'CAR' ? 'CAR' : 'BIKE'
  const linked = vehicle.product_variant_id ? variantPlanById.get(vehicle.product_variant_id) : null
  const currentSku = clean(vehicle.sku).toUpperCase()
  const plannedSku = linked?.plannedSku || (canonical(type, currentSku) ? currentSku : allocate(type))
  return {
    productId: vehicle.product_id,
    product: productById.get(vehicle.product_id)?.name ?? 'Unknown',
    productType: type,
    vehicleVariantId: vehicle.id,
    productVariantId: vehicle.product_variant_id,
    version: vehicle.version,
    color: vehicle.color,
    interiorColor: vehicle.interior_color,
    currentSku,
    plannedSku,
    changed: currentSku !== plannedSku,
    isActive: vehicle.is_active !== false,
  }
})

const issues = []
const duplicateValues = (rows, pick) => {
  const counts = new Map()
  for (const row of rows) counts.set(pick(row), (counts.get(pick(row)) ?? 0) + 1)
  return [...counts.entries()].filter(([value, count]) => value && count > 1).map(([value]) => value)
}
for (const row of variantPlans) {
  if (!canonical(row.productType, row.plannedSku)) issues.push(`Invalid product variant SKU ${row.variantId}: ${row.plannedSku}`)
}
for (const row of vehiclePlans) {
  if (!canonical(row.productType, row.plannedSku)) issues.push(`Invalid vehicle variant SKU ${row.vehicleVariantId}: ${row.plannedSku}`)
  if (row.productVariantId && !variantPlanById.has(row.productVariantId)) issues.push(`Vehicle ${row.vehicleVariantId} links outside its vehicle product variants.`)
}
for (const sku of duplicateValues(variantPlans, (row) => row.plannedSku)) issues.push(`Duplicate planned product SKU: ${sku}`)
for (const sku of duplicateValues(vehiclePlans, (row) => row.plannedSku)) issues.push(`Duplicate planned vehicle SKU: ${sku}`)
for (const row of vehiclePlans.filter((item) => item.productVariantId)) {
  if (variantPlanById.get(row.productVariantId)?.plannedSku !== row.plannedSku) issues.push(`SKU mirror mismatch for vehicle ${row.vehicleVariantId}.`)
}

const report = {
  generatedAt: new Date().toISOString(),
  source: url,
  summary: {
    products: products.length,
    productVariants: variantPlans.length,
    orphanProductVariantsIgnored: orphanVariants.length,
    vehicleVariants: vehiclePlans.length,
    linkedVehicleVariants: vehiclePlans.filter((row) => row.productVariantId).length,
    unlinkedVehicleVariants: vehiclePlans.filter((row) => !row.productVariantId).length,
    carVariants: vehiclePlans.filter((row) => row.productType === 'CAR').length,
    bikeVariants: vehiclePlans.filter((row) => row.productType === 'BIKE').length,
    activeCarVariants: vehiclePlans.filter((row) => row.productType === 'CAR' && row.isActive).length,
    activeBikeVariants: vehiclePlans.filter((row) => row.productType === 'BIKE' && row.isActive).length,
    inventoryRowsPreserved: variantPlans.filter((row) => inventoryByVariantId.has(row.variantId)).length,
    inventoryRowsDefaultedToZero: variantPlans.filter((row) => !inventoryByVariantId.has(row.variantId)).length,
    carSkuChanges: vehiclePlans.filter((row) => row.productType === 'CAR' && row.changed).length,
    bikeSkuChanges: vehiclePlans.filter((row) => row.productType === 'BIKE' && row.changed).length,
    issues: issues.length,
  },
  issues,
  productVariants: variantPlans,
  vehicleVariants: vehiclePlans,
  ignoredOrphanProductVariants: orphanVariants.map((variant) => ({
    productId: variant.product_id,
    product: productById.get(variant.product_id)?.name ?? 'Unknown',
    productType: productById.get(variant.product_id)?.product_type ?? 'Unknown',
    variantId: variant.id,
    variant: variant.name,
    sku: clean(variant.sku).toUpperCase(),
    inventoryQuantity: Number(inventoryByVariantId.get(variant.id)?.on_hand_quantity ?? 0),
  })),
}

mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ reportPath, ...report.summary }, null, 2))
if (issues.length > 0) throw new Error(`Vehicle SKU verification failed with ${issues.length} issue(s).`)
