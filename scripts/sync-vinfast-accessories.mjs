import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const DATA_FILE = path.join(process.cwd(), 'public', 'data', 'by_type', 'accessories.json')
const CATEGORY_SLUG = 'phu-kien'

function requiredEnvironment(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing environment variable: ${name}`)
  return value
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function sourceKey(accessory) {
  return String(accessory.pid || accessory.sku || '').trim().toUpperCase()
}

function slugify(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function positiveMoney(value, context) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${context}: invalid price ${value}`)
  return parsed
}

function crawledStock(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0
}

function loadSources() {
  const rows = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Accessory source is empty')

  const productKeys = new Set()
  const variantSkus = new Set()
  return rows.map(accessory => {
    const key = sourceKey(accessory)
    if (!key || productKeys.has(key)) throw new Error(`Invalid or duplicate accessory key: ${key}`)
    productKeys.add(key)

    if (!Array.isArray(accessory.variants) || accessory.variants.length === 0) {
      throw new Error(`${key}: missing explicit variants`)
    }

    const variants = accessory.variants.map(variant => {
      const sku = String(variant.sku || variant.variant_id || '').trim().toUpperCase()
      if (!sku || variantSkus.has(sku)) throw new Error(`${key}: invalid or duplicate variant SKU ${sku}`)
      variantSkus.add(sku)
      return {
        sku,
        name: String(variant.name || 'Mặc định').trim() || 'Mặc định',
        color: typeof variant.attributes?.color === 'string' ? variant.attributes.color : null,
        battery_option: null,
        original_price: positiveMoney(variant.price ?? accessory.price, `${key}/${sku}`),
        sale_price: null,
        is_active: true,
        crawled_stock: crawledStock(variant.stock_quantity),
      }
    })

    return { key, data: accessory, variants }
  })
}

async function checked(operation, context) {
  const result = await operation
  if (result.error) throw new Error(`${context}: ${result.error.message}`)
  return result.data
}

function productPid(product) {
  const specifications = product.specifications
  if (!specifications || typeof specifications !== 'object' || Array.isArray(specifications)) return null
  const pid = specifications.pid || specifications.sku
  return typeof pid === 'string' ? pid.trim().toUpperCase() : null
}

function chooseSlug(source, existing, occupiedSlugs) {
  if (existing) return existing.slug
  const base = slugify(source.data.name) || slugify(source.key)
  let candidate = base
  if (occupiedSlugs.has(candidate)) candidate = `${base}-${slugify(source.key)}`
  let suffix = 2
  while (occupiedSlugs.has(candidate)) candidate = `${base}-${suffix++}`
  occupiedSlugs.add(candidate)
  return candidate
}

async function main() {
  const sources = loadSources()
  const supabase = createClient(
    requiredEnvironment('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const category = await checked(
    supabase.from('categories').select('id,slug').eq('slug', CATEGORY_SLUG).maybeSingle(),
    'Load accessory category',
  )
  if (!category) throw new Error(`Missing category: ${CATEGORY_SLUG}`)

  const products = await checked(
    supabase.from('products').select('*').eq('product_type', 'ACCESSORY'),
    'Load accessory products',
  )
  const allVariants = await checked(
    supabase.from('product_variants').select('*'),
    'Load product variants',
  )
  const accessoryProductIds = new Set(products.map(product => product.id))
  const variants = allVariants.filter(variant => accessoryProductIds.has(variant.product_id))
  const inventory = variants.length === 0
    ? []
    : await checked(
      supabase.from('inventory_items').select('*').in('variant_id', variants.map(variant => variant.id)),
      'Load accessory inventory',
    )

  const productsByPid = new Map(products.map(product => [productPid(product), product]).filter(([pid]) => pid))
  const productsBySlug = new Map(products.map(product => [product.slug, product]))
  const productsByVariantSku = new Map()
  for (const variant of variants) productsByVariantSku.set(variant.sku.toUpperCase(), products.find(product => product.id === variant.product_id))
  const allVariantsBySku = new Map(allVariants.map(variant => [variant.sku.toUpperCase(), variant]))
  const occupiedSlugs = new Set(products.map(product => product.slug))

  const matchedProductIds = new Set()
  const resolved = sources.map(source => {
    const nameSlug = slugify(source.data.name)
    const existing = productsByPid.get(source.key)
      || productsByVariantSku.get(source.key)
      || productsBySlug.get(nameSlug)
      || null
    if (existing) {
      if (matchedProductIds.has(existing.id)) throw new Error(`${source.key}: product matched more than once`)
      matchedProductIds.add(existing.id)
    }
    for (const expected of source.variants) {
      const collision = allVariantsBySku.get(expected.sku)
      if (collision && collision.product_id !== existing?.id) {
        throw new Error(`${source.key}: SKU ${expected.sku} belongs to another product`)
      }
    }
    return { ...source, existing, slug: chooseSlug(source, existing, occupiedSlugs) }
  })

  if (APPLY) {
    const backupDir = path.join(process.cwd(), '.local', 'data', 'db-backups')
    const backupFile = `vinfast-accessories-before-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    fs.mkdirSync(backupDir, { recursive: true })
    fs.writeFileSync(
      path.join(backupDir, backupFile),
      `${JSON.stringify({ created_at: new Date().toISOString(), products, variants, inventory }, null, 2)}\n`,
      'utf8',
    )
    console.log(`[BACKUP] ${path.join('.local', 'data', 'db-backups', backupFile)}`)
  }

  const summary = {
    products: { inserted: 0, updated: 0 },
    variants: { inserted: 0, updated: 0, deactivated: 0 },
    inventory: { inserted: 0, preserved: 0 },
  }
  const plan = {
    products: { inserted: 0, updated: 0 },
    variants: { inserted: 0, updated: 0, deactivated: 0 },
  }

  for (const source of resolved) {
    const action = source.existing ? 'UPDATE' : 'INSERT'
    const currentVariants = source.existing
      ? variants.filter(variant => variant.product_id === source.existing.id)
      : []
    const currentBySku = new Map(currentVariants.map(variant => [variant.sku.toUpperCase(), variant]))
    const expectedSkus = new Set(source.variants.map(variant => variant.sku))
    const obsolete = currentVariants.filter(variant => !expectedSkus.has(variant.sku.toUpperCase()) && variant.is_active)
    plan.products[source.existing ? 'updated' : 'inserted'] += 1
    plan.variants.updated += source.variants.filter(variant => currentBySku.has(variant.sku)).length
    plan.variants.inserted += source.variants.filter(variant => !currentBySku.has(variant.sku)).length
    plan.variants.deactivated += obsolete.length
    console.log(`${APPLY ? '[APPLY]' : '[DRY]'} ${action} ${source.key}: ${source.variants.length} variant(s), ${obsolete.length} obsolete`)

    if (!APPLY) continue

    const productPayload = {
      category_id: category.id,
      name: source.data.name,
      slug: source.slug,
      description: source.data.description || null,
      specifications: source.data,
      image_urls: source.data.images || [],
      is_active: true,
      product_type: 'ACCESSORY',
    }
    let productId
    if (source.existing) {
      const updated = await checked(
        supabase.from('products').update(productPayload).eq('id', source.existing.id).select('id').single(),
        `Update accessory ${source.key}`,
      )
      productId = updated.id
      summary.products.updated += 1
    } else {
      const inserted = await checked(
        supabase.from('products').insert(productPayload).select('id').single(),
        `Insert accessory ${source.key}`,
      )
      productId = inserted.id
      summary.products.inserted += 1
    }

    for (const expected of source.variants) {
      const existingVariant = currentBySku.get(expected.sku)
      const { crawled_stock: stock, ...variantPayload } = expected
      if (existingVariant) {
        await checked(
          supabase.from('product_variants').update({ product_id: productId, ...variantPayload }).eq('id', existingVariant.id),
          `Update variant ${expected.sku}`,
        )
        const existingInventory = inventory.find(item => item.variant_id === existingVariant.id)
        if (!existingInventory) {
          await checked(
            supabase.from('inventory_items').insert({ variant_id: existingVariant.id, on_hand_quantity: stock }),
            `Create inventory ${expected.sku}`,
          )
          summary.inventory.inserted += 1
        } else {
          summary.inventory.preserved += 1
        }
        summary.variants.updated += 1
      } else {
        const inserted = await checked(
          supabase.from('product_variants').insert({ product_id: productId, ...variantPayload }).select('id').single(),
          `Insert variant ${expected.sku}`,
        )
        await checked(
          supabase.from('inventory_items').insert({ variant_id: inserted.id, on_hand_quantity: stock }),
          `Create inventory ${expected.sku}`,
        )
        summary.variants.inserted += 1
        summary.inventory.inserted += 1
      }
    }

    if (obsolete.length > 0) {
      await checked(
        supabase.from('product_variants').update({ is_active: false }).in('id', obsolete.map(variant => variant.id)),
        `Deactivate obsolete variants ${source.key}`,
      )
      summary.variants.deactivated += obsolete.length
    }
  }

  if (!APPLY) {
    const expectedVariants = resolved.reduce((total, source) => total + source.variants.length, 0)
    console.log(JSON.stringify({ plan, expected_active_products: resolved.length, expected_active_variants: expectedVariants }, null, 2))
    console.log('Dry run complete; no database rows changed.')
    return
  }

  const activeProducts = await checked(
    supabase.from('products').select('id,name,slug,description,specifications,image_urls').eq('product_type', 'ACCESSORY').eq('is_active', true),
    'Verify accessory products',
  )
  const activeByPid = new Map(activeProducts.map(product => [productPid(product), product]).filter(([pid]) => pid))
  for (const source of resolved) {
    const actual = activeByPid.get(source.key)
    if (!actual) throw new Error(`Verification failed: missing accessory ${source.key}`)
    if (actual.name !== source.data.name || actual.description !== (source.data.description || null)) {
      throw new Error(`Verification failed: product text differs for ${source.key}`)
    }
    if (stableJson(actual.specifications) !== stableJson(source.data)) {
      throw new Error(`Verification failed: specifications differ for ${source.key}`)
    }
    if (stableJson(actual.image_urls) !== stableJson(source.data.images || [])) {
      throw new Error(`Verification failed: images differ for ${source.key}`)
    }

    const activeVariants = await checked(
      supabase.from('product_variants').select('id,sku,name,color,battery_option,original_price,sale_price').eq('product_id', actual.id).eq('is_active', true),
      `Verify variants ${source.key}`,
    )
    if (activeVariants.length !== source.variants.length) {
      throw new Error(`Verification failed: variant count differs for ${source.key}`)
    }
    const actualBySku = new Map(activeVariants.map(variant => [variant.sku.toUpperCase(), variant]))
    for (const expected of source.variants) {
      const variant = actualBySku.get(expected.sku)
      if (!variant
        || variant.name !== expected.name
        || variant.color !== expected.color
        || variant.battery_option !== null
        || Number(variant.original_price) !== expected.original_price
        || variant.sale_price !== null) {
        throw new Error(`Verification failed: variant differs for ${expected.sku}`)
      }
      const variantInventory = await checked(
        supabase.from('inventory_items').select('variant_id').eq('variant_id', variant.id).maybeSingle(),
        `Verify inventory ${expected.sku}`,
      )
      if (!variantInventory) throw new Error(`Verification failed: missing inventory for ${expected.sku}`)
    }
  }

  console.log(JSON.stringify({ ...summary, verified_accessories: resolved.length }, null, 2))
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
