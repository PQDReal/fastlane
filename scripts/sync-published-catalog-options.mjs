import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const REPLACE = process.argv.includes('--replace')
const DATA_DIRECTORY = path.join(process.cwd(), 'public', 'data', 'by_type')

const SOURCE_DEFINITIONS = [
  { file: 'cars.json', categorySlug: 'o-to-dien', productType: 'VEHICLE', kind: 'car' },
  { file: 'motorbikes.json', categorySlug: 'xe-may-dien', productType: 'VEHICLE', kind: 'motorbike' },
  { file: 'accessories.json', categorySlug: 'phu-kien', productType: 'ACCESSORY', kind: 'accessory' },
]

const GROUP_LABELS = {
  color: 'Màu sắc',
  size: 'Kích cỡ',
  package: 'Phiên bản',
  version: 'Phiên bản',
  exterior_color: 'Màu ngoại thất',
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing environment variable: ${name}`)
  return value
}

function assertDevelopmentTarget(url) {
  if (!APPLY) return
  const expectedRef = requiredEnvironment('SUPABASE_TARGET_PROJECT_REF')
  const actualRef = new URL(url).hostname.split('.')[0]
  if (actualRef !== expectedRef) {
    throw new Error(`Refusing to write project ${actualRef}; expected ${expectedRef}`)
  }
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function compactKey(value) {
  return slugify(value).replaceAll('-', '')
}

function uniqueStrings(values) {
  return [...new Set(values.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))]
}

function moneyValues(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return [Math.round(value)]
  if (typeof value !== 'string') return []
  return [...value.matchAll(/\d[\d.]{3,}/g)]
    .map(match => Number(match[0].replaceAll('.', '')))
    .filter(number => Number.isFinite(number))
}

function firstMoney(value) {
  return moneyValues(value)[0] ?? null
}

function mediaType(url) {
  return /\.(?:mp4|webm|mov)(?:\?|$)/i.test(url) ? 'VIDEO' : 'IMAGE'
}

function groupDisplayType(code) {
  return code === 'color' || code === 'exterior_color' ? 'SWATCH' : 'BUTTON'
}

function variantSku(productName, index) {
  return `VINFAST-${compactKey(productName).toUpperCase()}-${String(index + 1).padStart(2, '0')}`
}

function parseVehicleVariants(product) {
  const fallback = firstMoney(product.price) ?? 0
  const parsed = new Map()

  for (const raw of Array.isArray(product.variants) ? product.variants : []) {
    if (typeof raw !== 'string' || !raw.trim()) continue
    const [rawName] = raw.split(':', 1)
    const name = rawName
      .replace(/\s*\((?:Giá ưu đãi|Giá niêm yết gốc)\)\s*/gi, ' ')
      .trim() || 'Mặc định'
    const prices = moneyValues(raw)
    const current = parsed.get(name) || { name, originalPrice: null, salePrice: null }

    if (/niêm yết gốc/i.test(raw)) {
      current.originalPrice = prices[0] ?? current.originalPrice
    } else if (/niêm yết\s*:/i.test(raw) && prices.length >= 2) {
      current.salePrice = Math.min(prices[0], prices[1])
      current.originalPrice = Math.max(prices[0], prices[1])
    } else if (/ưu đãi/i.test(raw)) {
      current.salePrice = prices[0] ?? current.salePrice
    } else if (prices.length > 0) {
      current.originalPrice = prices[0]
    }
    parsed.set(name, current)
  }

  if (parsed.size === 0) {
    parsed.set('Mặc định', { name: 'Mặc định', originalPrice: fallback, salePrice: null })
  }

  return [...parsed.values()].map((variant, index) => {
    const onlyPrice = variant.originalPrice ?? variant.salePrice ?? fallback
    const originalPrice = variant.originalPrice && variant.salePrice
      ? Math.max(variant.originalPrice, variant.salePrice)
      : onlyPrice
    const salePrice = variant.originalPrice && variant.salePrice && variant.salePrice < variant.originalPrice
      ? variant.salePrice
      : null
    return {
      sku: variantSku(product.name, index),
      name: variant.name,
      original_price: originalPrice,
      sale_price: salePrice,
      stock: 0,
      attributes: { version: variant.name },
      images: [],
    }
  })
}

function parseAccessoryVariants(product) {
  if (!Array.isArray(product.variants) || product.variants.length === 0) {
    throw new Error(`${product.name}: published accessory has no variants`)
  }
  return product.variants.map(variant => {
    const sku = String(variant.sku || variant.variant_id || '').trim().toUpperCase()
    if (!sku) throw new Error(`${product.name}: variant is missing SKU`)
    const price = Number(variant.price ?? product.price)
    if (!Number.isFinite(price) || price < 0) throw new Error(`${product.name}/${sku}: invalid price`)
    return {
      sku,
      name: String(variant.name || 'Mặc định').trim() || 'Mặc định',
      original_price: price,
      sale_price: null,
      stock: Number.isInteger(variant.stock_quantity) && variant.stock_quantity >= 0
        ? variant.stock_quantity
        : 0,
      attributes: variant.attributes && typeof variant.attributes === 'object'
        ? Object.fromEntries(Object.entries(variant.attributes)
          .filter(([, value]) => typeof value === 'string' && value.trim())
          .map(([key, value]) => [slugify(key).replaceAll('-', '_'), value.trim()]))
        : {},
      images: uniqueStrings([variant.image, ...(Array.isArray(variant.images) ? variant.images : [])]),
    }
  })
}

function publishedProductMedia(source) {
  const product = source.data
  const rows = []
  const seen = new Set()
  const add = (url, role, order, metadata = {}) => {
    if (typeof url !== 'string' || !url.startsWith('http')) return
    const key = `${role}:${url}`
    if (seen.has(key)) return
    seen.add(key)
    rows.push({ url, role, media_type: mediaType(url), display_order: order, metadata })
  }

  if (source.kind === 'car' || source.kind === 'motorbike') {
    const gallery = product.gallery && typeof product.gallery === 'object' ? product.gallery : {}
    const groups = [
      ['banner_images', 'HERO'],
      ['exterior_images', 'EXTERIOR'],
      ['interior_images', 'INTERIOR'],
      ['tech_images', 'TECH'],
    ]
    let order = 0
    for (const [key, role] of groups) {
      for (const url of Array.isArray(gallery[key]) ? gallery[key] : []) {
        add(url, role, order++, { galleryGroup: key })
      }
    }
    for (const url of Array.isArray(product.images) ? product.images : []) add(url, 'GALLERY', order++)
  } else {
    const variantImages = new Set(source.variants.flatMap(variant => variant.images))
    let order = 0
    for (const url of Array.isArray(product.images) ? product.images : []) {
      if (!variantImages.has(url)) add(url, 'GALLERY', order++)
    }
  }
  return rows
}

function publishedColors(source) {
  const product = source.data
  if (source.kind === 'car') {
    return (Array.isArray(product.colors) ? product.colors : []).map((color, index) => {
      if (typeof color === 'string') return { name: color, image: null, swatch: null, index }
      return { name: color.name, image: color.image || null, swatch: color.swatch || null, index }
    }).filter(color => typeof color.name === 'string' && color.name.trim())
  }

  if (source.kind === 'motorbike') {
    const details = new Map((Array.isArray(product.color_details) ? product.color_details : [])
      .map(detail => [String(detail.color_name || '').trim().toLocaleLowerCase('vi'), detail.image_url]))
    return (Array.isArray(product.colors) ? product.colors : []).map((name, index) => ({
      name,
      image: details.get(String(name).trim().toLocaleLowerCase('vi')) || null,
      swatch: null,
      index,
    })).filter(color => typeof color.name === 'string' && color.name.trim())
  }
  return []
}

function loadPublishedSources() {
  const sources = []
  for (const definition of SOURCE_DEFINITIONS) {
    const rows = JSON.parse(fs.readFileSync(path.join(DATA_DIRECTORY, definition.file), 'utf8'))
    if (!Array.isArray(rows)) throw new Error(`${definition.file}: expected an array`)
    for (const data of rows) {
      const variants = definition.kind === 'accessory'
        ? parseAccessoryVariants(data)
        : parseVehicleVariants(data)
      sources.push({ ...definition, data, slug: slugify(data.name), variants })
    }
  }
  return sources
}

async function checked(operation, context) {
  const result = await operation
  if (result.error) throw new Error(`${context}: ${result.error.message}`)
  return result.data
}

function relatedCategory(product) {
  return Array.isArray(product.category) ? product.category[0] : product.category
}

function existingSourceKey(product) {
  const specs = product.specifications
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return null
  return String(specs.pid || specs.sku || '').trim().toUpperCase() || null
}

function sourceKey(source) {
  return String(source.data.pid || source.data.sku || '').trim().toUpperCase() || null
}

function findExistingProduct(source, products, variants) {
  if (source.kind === 'accessory') {
    const expectedSkus = new Set(source.variants.map(variant => variant.sku))
    const variantMatch = variants.find(variant => expectedSkus.has(variant.sku.toUpperCase()))
    if (variantMatch) return products.find(product => product.id === variantMatch.product_id) || null
    const key = sourceKey(source)
    if (key) {
      const keyMatch = products.find(product => existingSourceKey(product) === key)
      if (keyMatch) return keyMatch
    }
  }

  return products.find(product => {
    const category = relatedCategory(product)
    return category?.slug === source.categorySlug
      && (product.slug === source.slug || compactKey(product.name) === compactKey(source.data.name))
  }) || null
}

function productImages(source) {
  if (Array.isArray(source.data.images)) return uniqueStrings(source.data.images)
  const gallery = source.data.gallery
  return gallery && Array.isArray(gallery.all_images) ? uniqueStrings(gallery.all_images) : []
}

function productPayload(source, categoryId, existing) {
  const displayedPrice = firstMoney(source.data.price)
  return {
    category_id: categoryId,
    name: source.data.name,
    slug: existing?.slug || source.slug,
    description: source.data.description || existing?.description || null,
    specifications: source.data,
    image_urls: productImages(source),
    displayed_price: displayedPrice,
    is_active: true,
    product_type: source.productType,
  }
}

function variantPayload(source, variant) {
  return {
    sku: variant.sku,
    name: variant.name,
    color: null,
    battery_option: null,
    original_price: variant.original_price,
    sale_price: variant.sale_price,
    deposit_amount: firstMoney(source.data.deposit),
    metadata: { source: 'public/data/by_type', publishedAttributes: variant.attributes },
    is_active: true,
  }
}

async function backupCurrentData(supabase) {
  const tableNames = [
    'products', 'product_variants', 'inventory_items',
    'product_option_groups', 'product_option_values',
    'product_variant_option_values', 'product_media',
  ]
  const backup = { created_at: new Date().toISOString(), tables: {} }
  for (const table of tableNames) {
    backup.tables[table] = await checked(supabase.from(table).select('*'), `Backup ${table}`)
  }
  const directory = path.join(process.cwd(), '.local', 'data', 'db-backups')
  const filename = `published-catalog-before-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, filename), `${JSON.stringify(backup, null, 2)}\n`, 'utf8')
  console.log(`[BACKUP] ${path.relative(process.cwd(), path.join(directory, filename))}`)
}

async function insertInChunks(supabase, table, rows, context, chunkSize = 500) {
  for (let start = 0; start < rows.length; start += chunkSize) {
    await checked(supabase.from(table).insert(rows.slice(start, start + chunkSize)), context)
  }
}

async function synchronizeNormalizedProduct(supabase, source, product, variants) {
  await checked(supabase.from('product_media').delete().eq('product_id', product.id), `Clear media ${source.data.name}`)
  await checked(supabase.from('product_option_groups').delete().eq('product_id', product.id), `Clear options ${source.data.name}`)
  await checked(
    supabase.from('product_variants').update({ option_signature: null }).eq('product_id', product.id),
    `Clear signatures ${source.data.name}`,
  )

  const selectionsBySku = new Map(source.variants.map(variant => [variant.sku, { ...variant.attributes }]))
  if (source.productType === 'VEHICLE') {
    for (const variant of variants.filter(variant => variant.is_active)) {
      selectionsBySku.set(variant.sku, { version: variant.name })
    }
  }

  const groupValues = new Map()
  for (const selection of selectionsBySku.values()) {
    for (const [groupCode, valueName] of Object.entries(selection)) {
      const values = groupValues.get(groupCode) || new Map()
      values.set(slugify(valueName), valueName)
      groupValues.set(groupCode, values)
    }
  }

  const colors = publishedColors(source)
  if (colors.length > 0) {
    groupValues.set('exterior_color', new Map(colors.map(color => [slugify(color.name), color.name])))
  }

  const groupRows = [...groupValues.entries()].map(([code], index) => ({
    product_id: product.id,
    code,
    name: GROUP_LABELS[code] || code,
    display_type: groupDisplayType(code),
    minimum_selections: code === 'exterior_color' ? 0 : 1,
    maximum_selections: 1,
    display_order: index,
    metadata: { source: 'public/data/by_type' },
  }))
  const insertedGroups = groupRows.length > 0
    ? await checked(
      supabase.from('product_option_groups').insert(groupRows).select('id,code'),
      `Insert option groups ${source.data.name}`,
    )
    : []
  const groupByCode = new Map(insertedGroups.map(group => [group.code, group]))

  const colorByCode = new Map(colors.map(color => [slugify(color.name), color]))
  const valueRows = []
  for (const [groupCode, values] of groupValues) {
    const group = groupByCode.get(groupCode)
    let order = 0
    for (const [code, name] of values) {
      const color = groupCode === 'exterior_color' ? colorByCode.get(code) : null
      const accessoryColorVariant = groupCode === 'color'
        ? source.variants.find(variant => slugify(variant.attributes.color) === code)
        : null
      valueRows.push({
        product_id: product.id,
        option_group_id: group.id,
        code,
        name,
        swatch_url: color?.swatch || accessoryColorVariant?.images[0] || null,
        display_order: order++,
        metadata: color ? { sourceImage: color.image } : {},
      })
    }
  }
  const insertedValues = valueRows.length > 0
    ? await checked(
      supabase.from('product_option_values').insert(valueRows).select('id,option_group_id,code'),
      `Insert option values ${source.data.name}`,
    )
    : []
  const valueByGroupAndCode = new Map(insertedValues.map(value => [`${value.option_group_id}:${value.code}`, value]))

  const mappingRows = []
  const variantBySku = new Map(variants.map(variant => [variant.sku.toUpperCase(), variant]))
  for (const [sku, selection] of selectionsBySku) {
    const variant = variantBySku.get(sku.toUpperCase())
    if (!variant) throw new Error(`${source.data.name}: missing database variant ${sku}`)
    const signature = []
    for (const [groupCode, valueName] of Object.entries(selection)) {
      const group = groupByCode.get(groupCode)
      const value = valueByGroupAndCode.get(`${group.id}:${slugify(valueName)}`)
      if (!value) throw new Error(`${source.data.name}/${sku}: unresolved ${groupCode}=${valueName}`)
      mappingRows.push({
        product_id: product.id,
        variant_id: variant.id,
        option_group_id: group.id,
        option_value_id: value.id,
      })
      signature.push(`${groupCode}=${value.code}`)
    }
    await checked(
      supabase.from('product_variants').update({ option_signature: signature.sort().join('|') || null }).eq('id', variant.id),
      `Update option signature ${sku}`,
    )
  }
  await insertInChunks(supabase, 'product_variant_option_values', mappingRows, `Insert variant options ${source.data.name}`)

  const mediaRows = publishedProductMedia(source).map(row => ({
    ...row,
    product_id: product.id,
    alt_text: source.data.name,
  }))
  if (source.kind === 'accessory') {
    for (const sourceVariant of source.variants) {
      const variant = variantBySku.get(sourceVariant.sku)
      sourceVariant.images.forEach((url, index) => mediaRows.push({
        product_id: product.id,
        variant_id: variant.id,
        option_value_id: null,
        role: index === 0 ? 'THUMBNAIL' : 'GALLERY',
        media_type: mediaType(url),
        url,
        alt_text: `${source.data.name} - ${sourceVariant.name}`,
        display_order: index,
        metadata: { sourceSku: sourceVariant.sku },
      }))

      const colorName = sourceVariant.attributes.color
      if (colorName) {
        const colorGroup = groupByCode.get('color')
        const colorValue = colorGroup
          ? valueByGroupAndCode.get(`${colorGroup.id}:${slugify(colorName)}`)
          : null
        sourceVariant.images.forEach((url, index) => mediaRows.push({
          product_id: product.id,
          variant_id: null,
          option_value_id: colorValue?.id || null,
          role: index === 0 ? 'THUMBNAIL' : 'GALLERY',
          media_type: mediaType(url),
          url,
          alt_text: `${source.data.name} - ${colorName}`,
          display_order: index,
          metadata: { sourceAttribute: 'color' },
        }))
      }
    }
  } else {
    const colorGroup = groupByCode.get('exterior_color')
    for (const color of colors) {
      const value = colorGroup
        ? valueByGroupAndCode.get(`${colorGroup.id}:${slugify(color.name)}`)
        : null
      if (color.swatch) mediaRows.push({
        product_id: product.id,
        variant_id: null,
        option_value_id: value?.id || null,
        role: 'SWATCH',
        media_type: 'IMAGE',
        url: color.swatch,
        alt_text: `${source.data.name} - ${color.name}`,
        display_order: color.index,
        metadata: { sourceAttribute: 'exterior_color' },
      })
      if (color.image) mediaRows.push({
        product_id: product.id,
        variant_id: null,
        option_value_id: value?.id || null,
        role: 'EXTERIOR',
        media_type: mediaType(color.image),
        url: color.image,
        alt_text: `${source.data.name} - ${color.name}`,
        display_order: color.index,
        metadata: { sourceAttribute: 'exterior_color' },
      })
    }
  }

  const deduplicatedMedia = [...new Map(mediaRows.map(row => [
    `${row.variant_id || ''}:${row.option_value_id || ''}:${row.role}:${row.url}`,
    row,
  ])).values()]
  await insertInChunks(supabase, 'product_media', deduplicatedMedia, `Insert media ${source.data.name}`, 300)

  return {
    groups: insertedGroups.length,
    values: insertedValues.length,
    mappings: mappingRows.length,
    media: deduplicatedMedia.length,
  }
}

async function main() {
  const sources = loadPublishedSources()
  const url = requiredEnvironment('NEXT_PUBLIC_SUPABASE_URL')
  assertDevelopmentTarget(url)
  const supabase = createClient(url, requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const categories = await checked(supabase.from('categories').select('id,slug'), 'Load categories')
  const products = await checked(
    supabase.from('products').select('*,category:categories!inner(slug)'),
    'Load products',
  )
  const allVariants = await checked(supabase.from('product_variants').select('*'), 'Load variants')
  const categoryBySlug = new Map(categories.map(category => [category.slug, category]))

  const plan = {
    publishedProducts: sources.length,
    existingProducts: 0,
    insertedProducts: 0,
    insertedVariants: 0,
    updatedVariants: 0,
    deactivatedProducts: 0,
  }

  const resolved = sources.map(source => {
    const existing = findExistingProduct(source, products, allVariants)
    if (existing) plan.existingProducts++
    else plan.insertedProducts++
    const currentVariants = existing
      ? allVariants.filter(variant => variant.product_id === existing.id)
      : []
    const currentBySku = new Map(currentVariants.map(variant => [variant.sku.toUpperCase(), variant]))
    plan.insertedVariants += source.variants.filter(variant => !currentBySku.has(variant.sku)).length
    plan.updatedVariants += source.variants.filter(variant => currentBySku.has(variant.sku)).length
    return { source, existing, currentVariants }
  })

  const sourceIdentity = new Set(sources.map(source => `${source.categorySlug}:${compactKey(source.data.name)}`))
  const obsolete = products.filter(product => {
    const category = relatedCategory(product)
    return product.is_active
      && SOURCE_DEFINITIONS.some(definition => definition.categorySlug === category?.slug)
      && !sourceIdentity.has(`${category.slug}:${compactKey(product.name)}`)
  })
  plan.deactivatedProducts = REPLACE ? obsolete.length : 0

  if (!APPLY) {
    console.log(JSON.stringify({ plan, replaceWouldDeactivate: obsolete.map(product => product.name) }, null, 2))
    console.log('Dry run complete; no database rows changed.')
    return
  }

  await backupCurrentData(supabase)
  const summary = { ...plan, optionGroups: 0, optionValues: 0, mappings: 0, media: 0 }

  for (const item of resolved) {
    const { source } = item
    const category = categoryBySlug.get(source.categorySlug)
    if (!category) throw new Error(`Missing category ${source.categorySlug}`)
    let product = item.existing

    if (product) {
      product = await checked(
        supabase.from('products')
          .update(productPayload(source, category.id, product))
          .eq('id', product.id)
          .select('*')
          .single(),
        `Update product ${source.data.name}`,
      )
    } else {
      product = await checked(
        supabase.from('products')
          .insert(productPayload(source, category.id, null))
          .select('*')
          .single(),
        `Insert product ${source.data.name}`,
      )
    }

    const currentVariants = await checked(
      supabase.from('product_variants').select('*').eq('product_id', product.id),
      `Load product variants ${source.data.name}`,
    )
    const currentBySku = new Map(currentVariants.map(variant => [variant.sku.toUpperCase(), variant]))

    for (const expected of source.variants) {
      const payload = { product_id: product.id, ...variantPayload(source, expected) }
      const existingVariant = currentBySku.get(expected.sku)
      let variant
      if (existingVariant) {
        variant = await checked(
          supabase.from('product_variants').update(payload).eq('id', existingVariant.id).select('*').single(),
          `Update variant ${expected.sku}`,
        )
      } else {
        variant = await checked(
          supabase.from('product_variants').insert(payload).select('*').single(),
          `Insert variant ${expected.sku}`,
        )
      }
      currentBySku.set(variant.sku, variant)
      await checked(
        supabase.from('inventory_items').upsert({
          variant_id: variant.id,
          on_hand_quantity: source.kind === 'accessory' ? expected.stock : 0,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'variant_id' }),
        `Upsert inventory ${expected.sku}`,
      )
    }

    const variants = [...currentBySku.values()]
    const normalized = await synchronizeNormalizedProduct(supabase, source, product, variants)
    summary.optionGroups += normalized.groups
    summary.optionValues += normalized.values
    summary.mappings += normalized.mappings
    summary.media += normalized.media
    console.log(`[SYNC] ${source.categorySlug}/${product.slug}: ${normalized.groups} groups, ${normalized.values} values, ${normalized.media} media`)
  }

  if (REPLACE && obsolete.length > 0) {
    await checked(
      supabase.from('products').update({ is_active: false }).in('id', obsolete.map(product => product.id)),
      'Deactivate products absent from published data',
    )
  }

  const counts = await Promise.all([
    checked(supabase.from('product_option_groups').select('*', { count: 'exact', head: true }), 'Count groups'),
    checked(supabase.from('product_option_values').select('*', { count: 'exact', head: true }), 'Count values'),
    checked(supabase.from('product_variant_option_values').select('*', { count: 'exact', head: true }), 'Count mappings'),
    checked(supabase.from('product_media').select('*', { count: 'exact', head: true }), 'Count media'),
  ])
  console.log(JSON.stringify({ summary, verificationQueriesCompleted: counts.length }, null, 2))
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
