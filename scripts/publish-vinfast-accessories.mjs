import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  fetchCatalogProducts,
  mapLimit,
  scrapeProduct,
} from './crawl-vinfast-accessories.mjs'
import {
  taxonomyManifest,
  validatePublishedTaxonomy,
} from './catalog-taxonomy-source.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LOCAL_PRODUCTS = path.join(ROOT, '.local', 'vinfast-products')
const PUBLISH = process.argv.includes('--publish')
const requestedDate = process.argv.find(argument => argument.startsWith('--date='))?.slice('--date='.length)
const outputDate = requestedDate || new Date().toISOString().slice(0, 10)
const outputDir = path.join(ROOT, '.local', 'data', `crawled_${outputDate}`)
const crawledAt = new Date().toISOString()

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function validate(accessories) {
  const errors = []
  const pids = new Set()
  const variantSkus = new Set()
  for (const product of accessories) {
    if (!product.pid || pids.has(product.pid)) errors.push(`${product.pid || '(missing)'}: PID thiếu hoặc trùng`)
    pids.add(product.pid)
    if (!product.name || !product.url || !product.images.length || !product.price) errors.push(`${product.pid}: thiếu trường bắt buộc`)
    if (!product.categories.length) errors.push(`${product.pid}: thiếu taxonomy chính thức`)
    if (!product.variants.length) errors.push(`${product.pid}: không có sellable variant`)
    for (const variant of product.variants) {
      if (!variant.sku || !variant.price || !variant.images.length) errors.push(`${product.pid}: variant không đầy đủ`)
      if (variantSkus.has(variant.sku)) errors.push(`${product.pid}: variant SKU trùng ${variant.sku}`)
      variantSkus.add(variant.sku)
    }
  }
  if (accessories.length !== 83) errors.push(`Catalog có ${accessories.length} sản phẩm, kỳ vọng 83`)
  const manifest = taxonomyManifest({ crawledAt, expectedProducts: accessories.length })
  const taxonomyReport = validatePublishedTaxonomy(manifest, accessories)
  errors.push(...taxonomyReport.errors)
  if (errors.length) throw new Error(`Dữ liệu không hợp lệ:\n- ${errors.join('\n- ')}`)
  return { manifest, taxonomyReport }
}

async function runRecrawl() {
  console.log('[1/4] Đọc catalog và taxonomy chính thức')
  const catalog = await fetchCatalogProducts()
  console.log(`  [OK] ${catalog.length} sản phẩm live`)

  console.log('[2/4] Crawl chi tiết, SKU, giá, ảnh và tồn kho variant')
  const accessories = await mapLimit(catalog, 4, async (product, index) => {
    const result = await scrapeProduct(product, crawledAt)
    console.log(`  [${index + 1}/${catalog.length}] ${result.pid}: ${result.variants.length} variant`)
    return result
  })

  console.log('[3/4] Kiểm tra schema và tính toàn vẹn')
  const { manifest, taxonomyReport } = validate(accessories)
  const variantCount = accessories.reduce((total, product) => total + product.variants.length, 0)
  console.log(`  [OK] ${accessories.length} sản phẩm, ${variantCount} sellable variant`)

  console.log(`[4/4] Ghi dữ liệu sạch vào ${outputDir}`)
  writeJson(path.join(outputDir, 'accessories_clean.json'), accessories)
  writeJson(path.join(outputDir, 'catalog-taxonomy.json'), manifest)
  const masterPath = path.join(LOCAL_PRODUCTS, 'master_products.json')
  const master = readJson(masterPath, { cars: [], motorbikes: [], accessories: [] })
  master.accessories = accessories
  writeJson(path.join(outputDir, 'master_products_clean.json'), master)
  if (PUBLISH) {
    const publicData = path.join(ROOT, 'public', 'data')
    const publicMasterPath = path.join(publicData, 'master_products.json')
    const publicMaster = readJson(publicMasterPath, { cars: [], motorbikes: [], accessories: [] })
    publicMaster.accessories = accessories
    writeJson(path.join(publicData, 'by_type', 'accessories.json'), accessories)
    writeJson(publicMasterPath, publicMaster)
    writeJson(path.join(publicData, 'catalog', 'catalog-taxonomy.json'), manifest)
    console.log(`  [OK] Published schema v2 (${taxonomyReport.collections} collections, ${taxonomyReport.vehicleModels} vehicle models)`)
  } else {
    console.log('  [OK] Chỉ ghi .local; dùng --publish để cập nhật public data, không ghi database')
  }
}

runRecrawl().catch(error => {
  console.error(error)
  process.exitCode = 1
})
