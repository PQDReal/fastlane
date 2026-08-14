import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import Redis from 'ioredis'
import { createClient } from '@supabase/supabase-js'
import {
  normalizeVersionName,
  selectCanonicalSourceVersions,
} from './motorbike-version-normalization.mjs'

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
const oldProductsById = new Map(products.map((product) => [product.id, product]))

assert(products.length > 0, 'Expected at least one active motorbike')

const generatedAt = new Date().toISOString()
const rows = []
const report = []
const productSpecificationUpdates = []

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
  const versions = selectCanonicalSourceVersions({
    product,
    sourceVariants,
    overrides: VERSION_OVERRIDES,
  })

  assert(Array.isArray(colors) && colors.length > 0, `${product.name}: missing colors`)
  assert(Array.isArray(images), `${product.name}: image_urls must be an array`)
  assert(
    images.length === 5 + colors.length * 2,
    `${product.name}: expected ${5 + colors.length * 2} images, received ${images.length}`,
  )
  assert(versions.length > 0, `${product.name}: missing active versions`)

  const detailImages = images.slice(-3)
  const canonicalVersionNames = versions.map((sourceVersion) =>
    VERSION_OVERRIDES[sourceVersion.baseSku]?.name ?? sourceVersion.canonicalName,
  )
  const canonicalSpecifications = {
    ...specifications,
    variants: canonicalVersionNames,
    variant_compatibility: Array.isArray(specifications.variant_compatibility)
      ? specifications.variant_compatibility.map((entry) => ({
          ...entry,
          version: canonicalVersionNames.find((name) =>
            String(entry?.version ?? '').toLocaleLowerCase('vi').startsWith(name.toLocaleLowerCase('vi')),
          ) ?? entry.version,
        }))
      : specifications.variant_compatibility,
  }
  productSpecificationUpdates.push({ id: product.id, specifications: canonicalSpecifications })
  const catalogSpecs = {
    ...canonicalSpecifications,
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
    assert(nonEmpty(sourceVersion.baseSku), `${product.name}: version missing SKU`)
    assert(nonEmpty(sourceVersion.name), `${product.name}: version missing name`)

    const override = VERSION_OVERRIDES[sourceVersion.baseSku] ?? {}
    const versionName = override.name ?? sourceVersion.canonicalName
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
      assert(detailImages.length === 3, `${product.name}: detail image contract must contain three slots`)

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
        sku: `${sourceVersion.baseSku}-C${String(colorIndex + 1).padStart(2, '0')}`,
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

const oldRowsBySku = new Map(oldBikeRows.map((row) => [String(row.sku).toUpperCase(), row]))
const usedOldIds = new Set()
for (const row of rows) {
  const existing = oldRowsBySku.get(String(row.sku).toUpperCase())
  if (existing && !usedOldIds.has(existing.id)) {
    row.id = existing.id
    usedOldIds.add(existing.id)
  }
}

async function invalidateDepositMetadataCache() {
  const redisUrl = process.env.REDIS_URL?.trim()
  if (!redisUrl) return 0

  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 })
  redis.on('error', () => undefined)
  try {
    let cursor = '0'
    let deleted = 0
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        'fastlane:deposit-vehicle-metadata:v1:*',
        'COUNT',
        100,
      )
      cursor = nextCursor
      if (keys.length > 0) deleted += await redis.del(...keys)
    } while (cursor !== '0')
    return deleted
  } catch (error) {
    console.warn(`Unable to invalidate Redis metadata cache: ${error instanceof Error ? error.message : String(error)}`)
    return 0
  } finally {
    await redis.quit().catch(() => redis.disconnect())
  }
}

// Preserve IDs that are referenced by deposit orders even when their legacy
// SKU is not part of the regenerated matrix.
for (const oldRow of oldBikeRows.filter((row) => referencedOldRows.some((order) => order.vehicle_variant_id === row.id))) {
  if (usedOldIds.has(oldRow.id)) continue
  const product = oldProductsById.get(oldRow.product_id)
  const specifications = product?.specifications && typeof product.specifications === 'object'
    ? product.specifications
    : {}
  const oldVersion = normalizeVersionName({
    productName: product?.name,
    rawName: oldRow.version,
    declaredVersions: specifications.variants,
    colors: specifications.color_details,
  })
  const replacement = rows.find((row) =>
    row.product_id === oldRow.product_id
      && row.color === oldRow.color
      && row.version.toLocaleLowerCase('vi') === oldVersion.toLocaleLowerCase('vi')
      && !usedOldIds.has(row.id),
  ) ?? rows.find((row) =>
    row.product_id === oldRow.product_id
      && row.color === oldRow.color
      && !usedOldIds.has(row.id),
  )
  assert(replacement, `No replacement generated for referenced row ${oldRow.id}`)
  replacement.id = oldRow.id
  usedOldIds.add(oldRow.id)
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
  assert(migratedRows.length === rows.length, `Verified ${migratedRows.length}/${rows.length} migrated rows`)
  assert(migratedRows.every((row) => nonEmpty(row.sku) && nonEmpty(row.version) && nonEmpty(row.color)), 'Migrated rows are incomplete')

  const obsoleteIds = oldBikeRows.map((row) => row.id).filter((id) => !usedOldIds.has(id))
  for (const ids of chunk(obsoleteIds, 50)) {
    const { error } = await supabase.from('vehicle_variants').delete().in('id', ids)
    if (error) throw new Error(`Unable to remove obsolete BIKE rows: ${error.message}`)
  }

  for (const update of productSpecificationUpdates) {
    const { error } = await supabase
      .from('products')
      .update({ specifications: update.specifications, updated_at: new Date().toISOString() })
      .eq('id', update.id)
    if (error) throw new Error(`Unable to normalize ${update.id} specifications: ${error.message}`)
  }
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
  for (const [id, product] of oldProductsById) {
    await supabase.from('products').update({ specifications: product.specifications }).eq('id', id)
  }
  throw error
}

const { data: finalRows, error: finalError } = await supabase
  .from('vehicle_variants')
  .select('*')
  .eq('product_type', 'BIKE')

if (finalError) throw new Error(`Final verification failed: ${finalError.message}`)
assert(finalRows?.length === rows.length, `Final BIKE row count is ${finalRows?.length ?? 0}, expected ${rows.length}`)

const invalidatedMetadataKeys = await invalidateDepositMetadataCache()

console.log(`Migration complete: ${rows.length}/${rows.length} BIKE vehicle_variants rows verified.`)
console.log(`Invalidated ${invalidatedMetadataKeys} deposit metadata cache keys.`)
