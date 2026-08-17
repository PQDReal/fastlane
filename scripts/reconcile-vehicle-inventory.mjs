import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

import {
  isCanonicalVehicleSku,
  text,
  vehicleConfigurationKey,
  vehicleInteriorColor,
  vehicleProductType,
  vehicleVersionSku,
} from './vehicle-variant-identity.mjs'

const apply = process.argv.includes('--apply')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
const slugPart = (value) => text(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .toLowerCase()
const isVehicleConfig = (row) => ['CAR', 'BIKE', 'MOTORBIKE'].includes(String(row.product_type ?? '').toUpperCase())
  && Boolean(text(row.version) || text(row.variant_name))
  && Boolean(text(row.color))
const variantMetadata = (variant) => variant?.metadata && typeof variant.metadata === 'object' && !Array.isArray(variant.metadata)
  ? variant.metadata
  : {}
const variantConfigurationKey = (variant) => {
  const metadata = variantMetadata(variant)
  if (!text(metadata.version) || !text(metadata.color)) return null
  return vehicleConfigurationKey({
    productId: variant.product_id,
    version: metadata.version,
    color: metadata.color,
    interiorColor: metadata.interior_color,
  })
}

async function loadData() {
  const [productsResult, variantsResult, inventoryResult, vehiclesResult] = await Promise.all([
    supabase.from('products').select('id,name,product_type,is_active').in('product_type', ['CAR', 'BIKE', 'MOTORBIKE']).order('name'),
    supabase.from('product_variants').select('id,product_id,sku,name,original_price,sale_price,deposit_amount,is_active,metadata').order('id'),
    supabase.from('inventory_items').select('variant_id,on_hand_quantity,updated_at'),
    supabase.from('vehicle_variants').select('id,product_id,product_variant_id,product_type,variant_name,sku,version,color,interior_color,specs,price,deposit_amount,is_active').in('product_type', ['CAR', 'BIKE', 'MOTORBIKE']).order('product_id').order('id'),
  ])
  for (const [label, result] of [['products', productsResult], ['product_variants', variantsResult], ['inventory_items', inventoryResult], ['vehicle_variants', vehiclesResult]]) {
    if (result.error) throw new Error(`${label}: ${result.error.message}`)
  }
  return {
    products: productsResult.data ?? [],
    variants: variantsResult.data ?? [],
    inventory: inventoryResult.data ?? [],
    vehicles: vehiclesResult.data ?? [],
  }
}

function productVariantPayload({ product, row, source, variantId, sku }) {
  const metadata = variantMetadata(source)
  const version = text(row.version) || text(metadata.version)
  const color = text(row.color) || text(metadata.color)
  const interiorColor = vehicleInteriorColor(row) || text(metadata.interior_color)
  return {
    id: variantId,
    product_id: product.id,
    sku,
    name: text(row.variant_name) || [version, color, interiorColor].filter(Boolean).join(' - ') || source?.name || sku,
    original_price: Number(row.price ?? source?.original_price ?? 0),
    sale_price: source?.sale_price ?? null,
    is_active: row.is_active !== false && product.is_active !== false,
    option_signature: [
      `version=${slugPart(version)}`,
      `color=${slugPart(color)}`,
      `interior=${slugPart(interiorColor)}`,
    ].join('&'),
    metadata: {
      ...metadata,
      source: 'vehicle_inventory_reconciliation',
      base_sku: vehicleVersionSku(row) || text(metadata.base_sku) || version,
      version,
      color,
      interior_color: interiorColor,
    },
    deposit_amount: Number(row.deposit_amount ?? source?.deposit_amount ?? 0),
  }
}

function vehicleSpecs(row) {
  const specs = row.specs && typeof row.specs === 'object' && !Array.isArray(row.specs) ? row.specs : {}
  const catalog = specs.catalog && typeof specs.catalog === 'object' && !Array.isArray(specs.catalog) ? specs.catalog : {}
  return {
    ...specs,
    catalog: {
      ...catalog,
      version_sku: vehicleVersionSku(row) || text(row.version),
    },
  }
}

function buildPlan(data) {
  const variantsById = new Map(data.variants.map((row) => [row.id, row]))
  const inventoryByVariantId = new Map(data.inventory.map((row) => [row.variant_id, row]))
  const variantsByProductAndConfiguration = new Map()
  for (const variant of data.variants) {
    const key = variantConfigurationKey(variant)
    if (!key) continue
    const rows = variantsByProductAndConfiguration.get(key) ?? []
    rows.push(variant)
    variantsByProductAndConfiguration.set(key, rows)
  }

  const plans = []
  const summaries = []
  for (const product of data.products) {
    const productRows = data.vehicles
      .filter((row) => row.product_id === product.id && isVehicleConfig(row))
      .sort((left, right) => vehicleConfigurationKey({
        productId: left.product_id,
        version: left.version,
        color: left.color,
        interiorColor: vehicleInteriorColor(left),
      }).localeCompare(vehicleConfigurationKey({
        productId: right.product_id,
        version: right.version,
        color: right.color,
        interiorColor: vehicleInteriorColor(right),
      })))
    const usedVariantIds = new Set()
    let duplicateLinks = 0
    let unlinkedRows = 0

    for (const row of productRows) {
      const linked = row.product_variant_id ? variantsById.get(row.product_variant_id) : null
      const linkedSource = linked?.product_id === product.id && !usedVariantIds.has(linked.id) ? linked : null
      let source = linkedSource
      if (row.product_variant_id && !source) duplicateLinks += 1
      if (!row.product_variant_id) unlinkedRows += 1

      const configurationKey = vehicleConfigurationKey({
        productId: product.id,
        version: row.version,
        color: row.color,
        interiorColor: vehicleInteriorColor(row),
      })
      if (!source) {
        source = (variantsByProductAndConfiguration.get(configurationKey) ?? [])
          .find((variant) => !usedVariantIds.has(variant.id)) ?? null
      }

      const productType = vehicleProductType(product.product_type)
      // Never attach an unlinked legacy product variant merely because its
      // metadata matches. A new configuration must receive a canonical SKU.
      if (source && source !== linkedSource && !isCanonicalVehicleSku(source.sku, productType)) {
        source = null
      }
      const variantId = source?.id ?? randomUUID()
      if (source) usedVariantIds.add(source.id)
      const canonicalSourceSku = source && isCanonicalVehicleSku(source.sku, productType)
        ? text(source.sku).toUpperCase()
        : null
      const quantity = source
        ? Math.max(0, Number(inventoryByVariantId.get(source.id)?.on_hand_quantity ?? 0) || 0)
        : 0
      plans.push({
        product,
        productType,
        row,
        source,
        originalId: row.product_variant_id,
        variantId,
        sku: canonicalSourceSku,
        quantity,
        isNew: !source,
        hasInventory: source ? inventoryByVariantId.has(source.id) : false,
        legacySourceSku: source && !canonicalSourceSku ? text(source.sku) : null,
      })
    }

    const productPlans = plans.filter((plan) => plan.product.id === product.id)
    summaries.push({
      product: product.name,
      productType: vehicleProductType(product.product_type),
      configurations: productRows.length,
      unlinkedVehicleRows: unlinkedRows,
      duplicateLinks,
      newProductVariants: productPlans.filter((plan) => plan.isNew).length,
      legacyLinkedSkus: productPlans.filter((plan) => plan.legacySourceSku).length,
      missingInventoryRows: productPlans.filter((plan) => !plan.hasInventory).length,
    })
  }
  return { plans, summaries }
}

async function allocateNewSkus(plans) {
  for (const productType of ['CAR', 'BIKE']) {
    const targets = plans.filter((plan) => plan.productType === productType && !plan.sku)
    if (targets.length === 0) continue
    const { data, error } = await supabase.rpc('allocate_vehicle_variant_skus', {
      target_product_type: productType,
      requested_count: targets.length,
    })
    if (error) throw new Error(`Unable to allocate ${productType} SKUs: ${error.message}`)
    if (!Array.isArray(data) || data.length !== targets.length) {
      throw new Error(`Vehicle SKU allocator returned ${Array.isArray(data) ? data.length : 0} of ${targets.length} ${productType} SKUs.`)
    }
    targets.forEach((plan, index) => {
      const sku = text(data[index]).toUpperCase()
      if (!isCanonicalVehicleSku(sku, productType)) throw new Error(`Allocator returned invalid ${productType} SKU ${sku}.`)
      plan.sku = sku
    })
  }
}

const before = await loadData()
const { plans, summaries } = buildPlan(before)
const legacyPlans = plans.filter((plan) => plan.legacySourceSku)
const changedPlans = () => plans.filter((plan) => plan.isNew
  || plan.originalId !== plan.variantId
  || text(plan.row.sku).toUpperCase() !== plan.sku
  || text(plan.row.interior_color) !== vehicleInteriorColor(plan.row)
  || !plan.hasInventory)

console.log(JSON.stringify({
  apply,
  migrationRequiredBeforeApply: legacyPlans.length > 0,
  legacyLinkedSkus: legacyPlans.length,
  newProductVariantsToAllocate: plans.filter((plan) => plan.isNew).length,
  affectedProducts: summaries.filter((summary) => summary.unlinkedVehicleRows > 0
    || summary.duplicateLinks > 0
    || summary.newProductVariants > 0
    || summary.missingInventoryRows > 0),
  plannedRows: plans.length,
  rowsToWriteAfterMigration: plans.filter((plan) => plan.isNew
    || plan.originalId !== plan.variantId
    || !plan.hasInventory).length,
}, null, 2))

if (!apply) {
  console.log(legacyPlans.length > 0
    ? 'Dry run only. Apply migration 056 first, then rerun with --apply to repair links and inventory using canonical SKUs.'
    : 'Dry run only. Canonical SKU migration is complete; rerun with --apply to repair the reported links or inventory rows.')
  process.exit(0)
}
if (legacyPlans.length > 0) {
  throw new Error(`Refusing to reconcile ${legacyPlans.length} legacy vehicle SKUs. Apply migration 056_vehicle_sku_sequences.sql first.`)
}

await allocateNewSkus(plans)
const now = new Date().toISOString()
for (const plan of changedPlans()) {
  const payload = productVariantPayload({
    product: plan.product,
    row: plan.row,
    source: plan.source,
    variantId: plan.variantId,
    sku: plan.sku,
  })
  const { id: _payloadId, ...updatePayload } = payload
  const variantResult = plan.source
    ? await supabase.from('product_variants').update(updatePayload).eq('id', plan.variantId)
    : await supabase.from('product_variants').insert(payload)
  if (variantResult.error) throw new Error(`product_variant ${plan.variantId}: ${variantResult.error.message}`)

  const vehicleResult = await supabase
    .from('vehicle_variants')
    .update({
      product_variant_id: plan.variantId,
      sku: plan.sku,
      interior_color: vehicleInteriorColor(plan.row) || null,
      specs: vehicleSpecs(plan.row),
    })
    .eq('id', plan.row.id)
  if (vehicleResult.error) throw new Error(`vehicle_variant ${plan.row.id}: ${vehicleResult.error.message}`)

  const inventoryResult = await supabase
    .from('inventory_items')
    .upsert({ variant_id: plan.variantId, on_hand_quantity: plan.quantity, updated_at: now }, { onConflict: 'variant_id' })
  if (inventoryResult.error) throw new Error(`inventory_item ${plan.variantId}: ${inventoryResult.error.message}`)
}

const after = await loadData()
const verification = buildPlan(after)
const remaining = verification.plans.filter((plan) => plan.isNew
  || plan.originalId !== plan.variantId
  || plan.legacySourceSku
  || !plan.hasInventory
  || !plan.sku)
if (remaining.length > 0) throw new Error(`Reconciliation incomplete for ${remaining.length} vehicle configuration(s).`)
console.log(`Applied ${changedPlans().length} row updates/inserts with canonical SKUs. Every vehicle configuration now has its own inventory row.`)
