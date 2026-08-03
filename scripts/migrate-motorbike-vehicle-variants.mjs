import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRoleKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
  )
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
})

// Corrections verified against the current official VinFast catalog and the
// repository's preserved product snapshot. Keep this list deliberately small:
// every unlisted version continues to use the published product_variants row.
const VERSION_OVERRIDES = {
  'VINFAST-AMIOS2-01': {
    original_price: 12_000_000,
  },
  'VINFAST-EVONEO-01': {
    name: 'Tùy chọn Kèm Pin (Mua đứt pin)',
    original_price: 17_800_000,
  },
  'VINFAST-EVONEO-02': {
    name: 'Tùy chọn Không kèm Pin (Thuê pin)',
    original_price: 12_200_000,
  },
  'VINFAST-VIPER-01': {
    name: 'Kèm Pin',
    original_price: 40_600_000,
  },
  'VINFAST-VIPER-02': {
    name: 'Không kèm Pin',
    original_price: 35_000_000,
  },
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function chunk(items, size) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function writeJson(relativePath, data) {
  const outputPath = path.join(process.cwd(), relativePath)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(data, null, 2)}\n`)
  return outputPath
}

const [productResult, sourceVariantResult, targetResult, depositResult] =
  await Promise.all([
    supabase
      .from('products')
      .select('id,name,slug,description,specifications,image_urls')
      .in('product_type', ['BIKE', 'MOTORBIKE'])
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('product_variants')
      .select(
        'id,product_id,sku,name,original_price,sale_price,deposit_amount,is_active',
      )
      .eq('is_active', true),
    supabase.from('vehicle_variants').select('*').eq('product_type', 'BIKE'),
    supabase
      .from('deposit_orders')
      .select('id,vehicle_variant_id')
      .not('vehicle_variant_id', 'is', null),
  ])

for (const [label, result] of [
  ['products', productResult],
  ['product_variants', sourceVariantResult],
  ['vehicle_variants', targetResult],
  ['deposit_orders', depositResult],
]) {
  if (result.error) {
    throw new Error(`Unable to read ${label}: ${result.error.message}`)
  }
}

const products = productResult.data ?? []
const sourceVariants = sourceVariantResult.data ?? []
const oldBikeRows = targetResult.data ?? []
const deposits = depositResult.data ?? []
const oldBikeIds = new Set(oldBikeRows.map((row) => row.id))
const referencedOldRows = deposits.filter((order) =>
  oldBikeIds.has(order.vehicle_variant_id),
)

assert(products.length === 18, `Expected 18 active motorbikes, received ${products.length}`)
assert(
  oldBikeRows.length === 18,
  `Expected 18 existing BIKE placeholders, received ${oldBikeRows.length}`,
)
assert(
  new Set(oldBikeRows.map((row) => row.product_id)).size === 18,
  'Existing BIKE placeholders must contain one row per product',
)

const generatedAt = new Date().toISOString()
const rows = []
const report = []

for (const product of products) {
  const specifications = product.specifications
  assert(
    specifications &&
      typeof specifications === 'object' &&
      !Array.isArray(specifications),
    `${product.name}: specifications must be an object`,
  )
  assert(nonEmpty(product.slug), `${product.name}: missing slug`)

  const colors = specifications.color_details
  const images = product.image_urls
  const versions = sourceVariants
    .filter((variant) => variant.product_id === product.id)
    .sort((left, right) =>
      String(left.sku).localeCompare(String(right.sku), 'en'),
    )

  assert(Array.isArray(colors) && colors.length > 0, `${product.name}: missing colors`)
  assert(Array.isArray(images), `${product.name}: image_urls must be an array`)
  assert(
    images.length === 5 + colors.length * 2,
    `${product.name}: expected ${5 + colors.length * 2} images, received ${images.length}`,
  )
  assert(versions.length > 0, `${product.name}: missing active versions`)

  const detailImages = images.slice(-3)
  const catalogSpecs = {
    ...specifications,
    catalog: {
      product_slug: product.slug,
      description: product.description ?? '',
      listing_image_url: images[0],
      hero_image_url: images[1],
      detail_image_urls: detailImages,
      migrated_at: generatedAt,
      source: 'products/product_variants',
    },
  }

  versions.forEach((sourceVersion, versionIndex) => {
    assert(nonEmpty(sourceVersion.sku), `${product.name}: version missing SKU`)
    assert(nonEmpty(sourceVersion.name), `${product.name}: version missing name`)

    const override = VERSION_OVERRIDES[sourceVersion.sku] ?? {}
    const versionName = override.name ?? sourceVersion.name
    const originalPrice =
      override.original_price ?? Number(sourceVersion.original_price)
    const salePrice =
      override.sale_price ??
      (sourceVersion.sale_price === null
        ? null
        : Number(sourceVersion.sale_price))
    const price = salePrice ?? originalPrice
    const depositAmount = Number(sourceVersion.deposit_amount)

    assert(Number.isFinite(originalPrice) && originalPrice >= 0, `${sourceVersion.sku}: invalid original price`)
    assert(Number.isFinite(price) && price >= 0, `${sourceVersion.sku}: invalid price`)
    assert(Number.isFinite(depositAmount) && depositAmount >= 0, `${sourceVersion.sku}: invalid deposit`)
    assert(depositAmount <= price, `${sourceVersion.sku}: deposit exceeds price`)

    colors.forEach((colorItem, colorIndex) => {
      const colorName = colorItem.color_name ?? colorItem.name
      const vehicleImage = images[2 + colorIndex * 2]
      const swatchImage = images[3 + colorIndex * 2]

      assert(nonEmpty(colorName), `${product.name}: color ${colorIndex + 1} has no name`)
      assert(nonEmpty(vehicleImage), `${product.name}/${colorName}: missing vehicle image`)
      assert(nonEmpty(swatchImage), `${product.name}/${colorName}: missing swatch image`)
      assert(detailImages.every(nonEmpty), `${product.name}: incomplete detail images`)

      rows.push({
        id: randomUUID(),
        product_id: product.id,
        product_type: 'BIKE',
        product_name: product.name,
        deposit_amount: depositAmount,
        specs: {
          ...catalogSpecs,
          catalog: {
            ...catalogSpecs.catalog,
            version_order: versionIndex + 1,
            color_order: colorIndex + 1,
            original_price: originalPrice,
            sale_price: salePrice,
          },
        },
        variant_name: `${product.name} ${versionName} - ${colorName}`,
        sku: `${sourceVersion.sku}-C${String(colorIndex + 1).padStart(2, '0')}`,
        price,
        color: colorName,
        image_car_url: vehicleImage,
        image_color_url: swatchImage,
        version: versionName,
        is_active: true,
      })
    })
  })

  report.push({
    product: product.name,
    versions: versions.length,
    colors: colors.length,
    rows: versions.length * colors.length,
  })
}

assert(rows.length === 118, `Expected 118 generated rows, received ${rows.length}`)

// Reuse every placeholder ID for the first generated combination of the same
// product. This preserves deposit_orders.vehicle_variant_id and any future FK
// references while replacing placeholder content in place.
for (const oldRow of oldBikeRows) {
  const replacement = rows.find((row) => row.product_id === oldRow.product_id)
  assert(replacement, `No replacement generated for placeholder ${oldRow.id}`)
  replacement.id = oldRow.id
}

assert(new Set(rows.map((row) => row.id)).size === rows.length, 'Duplicate generated IDs')
assert(new Set(rows.map((row) => row.sku.toUpperCase())).size === rows.length, 'Duplicate generated SKUs')
assert(
  new Set(rows.map((row) => `${row.product_id}|${row.version.toLowerCase()}|${row.color.toLowerCase()}`)).size === rows.length,
  'Duplicate product/version/color combinations',
)

const dryRunReport = {
  mode: APPLY ? 'apply' : 'dry-run',
  generatedAt,
  oldRows: oldBikeRows.length,
  newRows: rows.length,
  reusedPlaceholderIds: oldBikeRows.length,
  preservedDepositReferences: referencedOldRows.length,
  products: report,
  overrides: VERSION_OVERRIDES,
}

const reportPath = writeJson(
  path.join('.local', 'reports', 'motorbike-vehicle-variants-migration.json'),
  dryRunReport,
)
console.log(`Prepared ${rows.length} BIKE vehicle_variants rows.`)
console.log(`Report: ${path.relative(process.cwd(), reportPath)}`)

if (!APPLY) {
  console.log('Dry run only. Use --apply to write to Supabase.')
  process.exit(0)
}

const timestamp = generatedAt.replaceAll(':', '-').replaceAll('.', '-')
const backupPath = writeJson(
  path.join(
    '.local',
    'data',
    'db-backups',
    `vehicle-variants-bike-before-${timestamp}.json`,
  ),
  oldBikeRows,
)
console.log(`Backup: ${path.relative(process.cwd(), backupPath)}`)

const reusedIds = new Set(oldBikeRows.map((row) => row.id))
const rowsToInsert = rows.filter((row) => !reusedIds.has(row.id))
const rowsToUpdate = rows.filter((row) => reusedIds.has(row.id))
const insertedIds = []
try {
  for (const batch of chunk(rowsToInsert, 40)) {
    const { data, error } = await supabase
      .from('vehicle_variants')
      .insert(batch)
      .select('id')
    if (error) throw new Error(`Insert failed: ${error.message}`)
    insertedIds.push(...(data ?? []).map((row) => row.id))
  }

  assert(
    insertedIds.length === rowsToInsert.length,
    `Inserted ${insertedIds.length}/${rowsToInsert.length} new rows`,
  )

  for (const replacement of rowsToUpdate) {
    const { id, ...changes } = replacement
    const { data, error } = await supabase
      .from('vehicle_variants')
      .update(changes)
      .eq('id', id)
      .select('id')
      .single()
    if (error || data?.id !== id) {
      throw new Error(
        `Unable to update placeholder ${id}: ${error?.message ?? 'row not returned'}`,
      )
    }
  }

  const migratedRows = []
  for (const ids of chunk(rows.map((row) => row.id), 50)) {
    const { data, error } = await supabase
      .from('vehicle_variants')
      .select('*')
      .in('id', ids)
    if (error) throw new Error(`Post-insert verification failed: ${error.message}`)
    migratedRows.push(...(data ?? []))
  }
  assert(migratedRows.length === 118, `Verified ${migratedRows.length}/118 migrated rows`)
  assert(migratedRows.every((row) => nonEmpty(row.sku) && nonEmpty(row.version) && nonEmpty(row.color)), 'Migrated rows are incomplete')
} catch (error) {
  if (insertedIds.length > 0) {
    for (const ids of chunk(insertedIds, 50)) {
      await supabase.from('vehicle_variants').delete().in('id', ids)
    }
  }
  for (const oldRow of oldBikeRows) {
    const { id, ...changes } = oldRow
    await supabase.from('vehicle_variants').update(changes).eq('id', id)
  }
  throw error
}

const { data: finalRows, error: finalError } = await supabase
  .from('vehicle_variants')
  .select('*')
  .eq('product_type', 'BIKE')

if (finalError) throw new Error(`Final verification failed: ${finalError.message}`)
assert(finalRows?.length === 118, `Final BIKE row count is ${finalRows?.length ?? 0}, expected 118`)

console.log('Migration complete: 118/118 BIKE vehicle_variants rows verified.')
