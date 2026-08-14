import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const apply = process.argv.includes('--apply')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRoleKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
const clean = (value) => typeof value === 'string' ? value.trim() : ''
const slugPart = (value) => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .toUpperCase()
const isVehicleConfig = (row) => ['CAR', 'BIKE'].includes(String(row.product_type ?? '').toUpperCase())
  && Boolean(clean(row.sku) || clean(row.variant_name) || clean(row.version))
  && Boolean(clean(row.color))
const isVehicleRow = (row) => isVehicleConfig(row) && Boolean(row.product_variant_id)
const interiorOf = (row) => clean(row.interior_color) || clean(row.specs?.catalog?.interior_color)
const legacyUnlinkedSource = (row, productVariants, usedVariantIds) => {
  const exactSku = productVariants.find((variant) => !usedVariantIds.has(variant.id) && clean(variant.sku) === clean(row.sku))
  if (exactSku) return exactSku

  const prefix = `${clean(row.sku)}-`
  const candidates = productVariants.filter((variant) => {
    if (usedVariantIds.has(variant.id) || !clean(row.sku) || !clean(variant.sku).startsWith(prefix)) return false
    const metadata = variant.metadata && typeof variant.metadata === 'object' && !Array.isArray(variant.metadata)
      ? variant.metadata
      : {}
    const version = clean(metadata.version)
    const color = clean(metadata.color)
    return color === clean(row.color) && version.startsWith(`${clean(row.version)} -`)
  })
  return candidates.length === 1 ? candidates[0] : null
}
const productVariantPayload = ({ product, row, source, variantId, sku }) => {
  const metadata = source?.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)
    ? source.metadata
    : {}
  const version = clean(row.version) || clean(metadata.version)
  const color = clean(row.color) || clean(metadata.color)
  const interiorColor = interiorOf(row) || clean(metadata.interior_color)
  return {
    id: variantId,
    product_id: product.id,
    sku,
    name: clean(row.variant_name) || [version, color, interiorColor].filter(Boolean).join(' - ') || source?.name || sku,
    original_price: Number(row.price ?? source?.original_price ?? 0),
    sale_price: source?.sale_price ?? null,
    is_active: row.is_active !== false && product.is_active !== false,
    option_signature: [
      `version=${slugPart(version).toLowerCase()}`,
      `color=${slugPart(color).toLowerCase()}`,
      `interior=${slugPart(interiorColor).toLowerCase()}`,
    ].join('&'),
    metadata: {
      ...metadata,
      source: 'vehicle_inventory_reconciliation',
      base_sku: clean(metadata.base_sku) || clean(source?.sku) || sku,
      version,
      color,
      interior_color: interiorColor,
    },
    deposit_amount: Number(row.deposit_amount ?? source?.deposit_amount ?? 0),
  }
}

async function loadData() {
  const [productsResult, variantsResult, inventoryResult, vehiclesResult] = await Promise.all([
    supabase.from('products').select('id,name,product_type,is_active').in('product_type', ['CAR', 'BIKE']).order('name'),
    supabase.from('product_variants').select('id,product_id,sku,name,original_price,sale_price,deposit_amount,is_active,metadata').order('sku'),
    supabase.from('inventory_items').select('variant_id,on_hand_quantity,updated_at'),
    supabase.from('vehicle_variants').select('id,product_id,product_variant_id,product_type,variant_name,sku,version,color,interior_color,specs,price,deposit_amount,is_active').in('product_type', ['CAR', 'BIKE']).order('product_id').order('sku'),
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

function buildPlan(data) {
  const variantsById = new Map(data.variants.map((row) => [row.id, row]))
  const inventoryByVariantId = new Map(data.inventory.map((row) => [row.variant_id, row]))
  const vehiclesByProduct = new Map()
  for (const row of data.vehicles) {
    const list = vehiclesByProduct.get(row.product_id) ?? []
    list.push(row)
    vehiclesByProduct.set(row.product_id, list)
  }

  const plans = []
  const summaries = []
  for (const product of data.products) {
    const allRows = vehiclesByProduct.get(product.id) ?? []
    const rows = allRows
      .filter(isVehicleRow)
      .sort((left, right) => `${clean(left.version)}\u001f${clean(left.color)}\u001f${interiorOf(left)}\u001f${clean(left.sku)}`.localeCompare(`${clean(right.version)}\u001f${clean(right.color)}\u001f${interiorOf(right)}\u001f${clean(right.sku)}`))
    const productVariants = data.variants.filter((row) => row.product_id === product.id)
    const groups = new Map()
    for (const row of rows) {
      const groupKey = row.product_variant_id ? `linked:${row.product_variant_id}` : `unlinked:${row.id}`
      const list = groups.get(groupKey) ?? []
      list.push(row)
      groups.set(groupKey, list)
    }

    const usedVariantIds = new Set()
    for (const row of rows) usedVariantIds.add(row.product_variant_id)
    const unlinkedRows = allRows.filter((row) => isVehicleConfig(row) && !row.product_variant_id)
    let unlinkedRowsRepaired = 0
    for (const row of unlinkedRows) {
      const source = legacyUnlinkedSource(row, productVariants, usedVariantIds)
      if (!source) continue
      usedVariantIds.add(source.id)
      const sku = clean(row.sku) || source.sku
      plans.push({
        product,
        row,
        originalId: null,
        variantId: source.id,
        sku,
        quantity: Math.max(0, Number(inventoryByVariantId.get(source.id)?.on_hand_quantity ?? 0) || 0),
        isNew: false,
        productVariant: productVariantPayload({ product, row, source, variantId: source.id, sku }),
      })
      unlinkedRowsRepaired += 1
    }

    for (const group of groups.values()) {
      const originalId = group[0].product_variant_id
      const source = originalId ? variantsById.get(originalId) : null
      if (source?.sku) {
        group.sort((left, right) => Number(clean(right.sku) === clean(source.sku)) - Number(clean(left.sku) === clean(source.sku)))
      }
      group.forEach((row, index) => {
        const variantId = index === 0 && source?.product_id === product.id ? source.id : randomUUID()
        const sourceForPayload = index === 0 ? source : null
        const sku = clean(row.sku) || `${slugPart(product.name)}-${slugPart(row.version)}-${slugPart(row.color)}-${slugPart(interiorOf(row))}`
        const quantity = index === 0 && source?.id
          ? Math.max(0, Number(inventoryByVariantId.get(source.id)?.on_hand_quantity ?? 0) || 0)
          : 0
        plans.push({
          product,
          row,
          originalId,
          variantId,
          sku,
          quantity,
          isNew: variantId !== source?.id,
          productVariant: productVariantPayload({ product, row, source: sourceForPayload, variantId, sku }),
        })
      })
    }

    const duplicateLinks = [...groups.values()].filter((group) => group.length > 1).length
    summaries.push({
      product: product.name,
      productType: product.product_type,
      validVehicleRows: rows.length,
      unlinkedVehicleRows: unlinkedRows.length,
      unlinkedRowsRepaired,
      productVariantsBefore: productVariants.length,
      duplicateLinksRepaired: duplicateLinks,
      newProductVariants: plans.filter((plan) => plan.product.id === product.id && plan.isNew).length,
      preservedInventory: plans.filter((plan) => plan.product.id === product.id && !plan.isNew).reduce((sum, plan) => sum + plan.quantity, 0),
    })
  }
  return { plans, summaries }
}

const data = await loadData()
const { plans, summaries } = buildPlan(data)
const changedPlans = plans.filter((plan) => plan.isNew
  || plan.originalId !== plan.variantId
  || clean(data.variants.find((variant) => variant.id === plan.variantId)?.sku) !== plan.sku
  || clean(plan.row.interior_color) !== interiorOf(plan.row))

console.log(JSON.stringify({
  apply,
  affectedProducts: summaries.filter((summary) => summary.duplicateLinksRepaired > 0 || summary.newProductVariants > 0 || summary.unlinkedVehicleRows > 0),
  plannedRows: plans.length,
  rowsToWrite: changedPlans.length,
}, null, 2))

if (!apply) {
  console.log('Dry run only. Re-run with --apply to create one inventory row per vehicle configuration.')
  process.exit(0)
}

const now = new Date().toISOString()
for (const plan of changedPlans) {
  const existing = data.variants.some((variant) => variant.id === plan.variantId)
  const variantResult = existing
    ? await supabase.from('product_variants').update(plan.productVariant).eq('id', plan.variantId)
    : await supabase.from('product_variants').insert(plan.productVariant)
  if (variantResult.error) throw new Error(`product_variant ${plan.variantId}: ${variantResult.error.message}`)

  const vehicleResult = await supabase
    .from('vehicle_variants')
    .update({ product_variant_id: plan.variantId, interior_color: interiorOf(plan.row) || null })
    .eq('id', plan.row.id)
  if (vehicleResult.error) throw new Error(`vehicle_variant ${plan.row.id}: ${vehicleResult.error.message}`)

  const inventoryResult = await supabase
    .from('inventory_items')
    .upsert({ variant_id: plan.variantId, on_hand_quantity: plan.quantity, updated_at: now }, { onConflict: 'variant_id' })
  if (inventoryResult.error) throw new Error(`inventory_item ${plan.variantId}: ${inventoryResult.error.message}`)
}

const after = await loadData()
const verification = buildPlan(after)
const remainingDuplicateLinks = verification.summaries.filter((summary) => summary.duplicateLinksRepaired > 0)
if (remainingDuplicateLinks.length > 0) {
  throw new Error(`Reconciliation incomplete for: ${remainingDuplicateLinks.map((summary) => summary.product).join(', ')}`)
}
const remainingUnlinkedRows = verification.summaries.filter((summary) => summary.unlinkedVehicleRows > summary.unlinkedRowsRepaired)
if (remainingUnlinkedRows.length > 0) {
  throw new Error(`Unlinked vehicle configurations remain for: ${remainingUnlinkedRows.map((summary) => summary.product).join(', ')}`)
}
console.log(`Applied ${changedPlans.length} row updates/inserts. Every valid vehicle configuration now has its own product_variant and inventory_items row.`)
