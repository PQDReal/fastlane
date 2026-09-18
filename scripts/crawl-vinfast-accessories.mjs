import {
  CATALOG_TAXONOMY_SCHEMA_VERSION,
  CATALOG_TAXONOMY_SOURCE_SYSTEM,
  CATEGORY_DEFINITIONS as TAXONOMY_CATEGORY_DEFINITIONS,
  MODEL_DEFINITIONS as TAXONOMY_MODEL_DEFINITIONS,
  collectionMembershipsForProduct,
} from './catalog-taxonomy-source.mjs'

/**
 * VinFast accessory crawler.
 *
 * Reads the live official catalog, keeps official category memberships, and
 * resolves every sellable child SKU exposed by the product pages.
 */

const BASE_URL = 'https://shop.vinfastauto.com'
const GRID_URL = `${BASE_URL}/on/demandware.store/Sites-app_vinfast_vn-Site/vi_VN/Search-UpdateGrid`

const CATEGORY_DEFINITIONS = TAXONOMY_CATEGORY_DEFINITIONS
  .map(definition => ({ id: definition.sourceKey, name: definition.name }))

const MODEL_DEFINITIONS = TAXONOMY_MODEL_DEFINITIONS
  .map(definition => ({ id: definition.sourceKey, name: definition.name }))

function decodeHtml(value = '') {
  const named = {
    aacute: 'á', acirc: 'â', agrave: 'à', atilde: 'ã', auml: 'ä',
    Aacute: 'Á', Acirc: 'Â', Agrave: 'À', Atilde: 'Ã', Auml: 'Ä',
    ccedil: 'ç', Ccedil: 'Ç', eacute: 'é', ecirc: 'ê', egrave: 'è', euml: 'ë',
    Eacute: 'É', Ecirc: 'Ê', Egrave: 'È', Euml: 'Ë', iacute: 'í', icirc: 'î', igrave: 'ì', iuml: 'ï',
    Iacute: 'Í', Icirc: 'Î', Igrave: 'Ì', Iuml: 'Ï', ntilde: 'ñ', Ntilde: 'Ñ',
    oacute: 'ó', ocirc: 'ô', ograve: 'ò', oslash: 'ø', otilde: 'õ', ouml: 'ö',
    Oacute: 'Ó', Ocirc: 'Ô', Ograve: 'Ò', Oslash: 'Ø', Otilde: 'Õ', Ouml: 'Ö',
    uacute: 'ú', ucirc: 'û', ugrave: 'ù', uuml: 'ü', Uacute: 'Ú', Ucirc: 'Û', Ugrave: 'Ù', Uuml: 'Ü',
    yacute: 'ý', Yacute: 'Ý', quot: '"', apos: "'", nbsp: ' ', amp: '&', lt: '<', gt: '>'
  }
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&([A-Za-z]+);/g, (entity, name) => named[name] || entity)
}

function cleanHtmlText(value = '') {
  return decodeHtml(String(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(?:p|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function productImages(values) {
  return unique(values.map(absoluteUrl)).filter(url => !/\/colorselection\//i.test(url))
}

function absoluteUrl(value) {
  if (!value || value.startsWith('data:')) return ''
  try {
    return new URL(decodeHtml(value), BASE_URL).toString()
  } catch {
    return ''
  }
}

function parsePriceNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const match = String(value || '').match(/\d{1,3}(?:\.\d{3})+|\d+/)
  return match ? Number(match[0].replace(/\./g, '')) : 0
}

function formatMoney(value) {
  return `${new Intl.NumberFormat('vi-VN').format(value)} VNĐ`
}

async function fetchText(url, retries = 3) {
  let lastError
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36',
          'accept-language': 'vi-VN,vi;q=0.9,en-US;q=0.8',
          accept: 'text/html,application/xhtml+xml,application/json',
          'x-requested-with': 'XMLHttpRequest'
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(20000)
      })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      return await response.text()
    } catch (error) {
      lastError = error
      if (attempt < retries) await new Promise(resolve => setTimeout(resolve, attempt * 500))
    }
  }
  throw new Error(`${url}: ${lastError?.message || 'không tải được'}`)
}

async function mapLimit(values, limit, worker) {
  const output = new Array(values.length)
  let cursor = 0
  async function run() {
    while (cursor < values.length) {
      const index = cursor
      cursor += 1
      output[index] = await worker(values[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, run))
  return output
}

function parseGrid(html) {
  const matches = [...html.matchAll(/data-pid="([^"]+)"/gi)]
  const products = []
  const seen = new Set()
  for (let index = 0; index < matches.length; index += 1) {
    const pid = decodeHtml(matches[index][1])
    if (!pid || seen.has(pid)) continue
    seen.add(pid)
    const section = html.slice(matches[index].index, matches[index + 1]?.index || html.length)
    const nameMatch = section.match(/class="accessories-productName"[^>]*>([\s\S]*?)<\/p>/i)
    const priceMatch = section.match(/class="price-sale"[^>]*>([\s\S]*?)<\/span>/i)
    const urlMatch = section.match(/<a[^>]*href="([^"]+)"[^>]*class="accessories-product-item"/i)
    const images = unique([...section.matchAll(/<img[^>]*(?:src|data-src)="([^"]+)"/gi)]
      .map(match => absoluteUrl(match[1])))
    products.push({
      pid,
      name: cleanHtmlText(nameMatch?.[1] || ''),
      price: parsePriceNumber(cleanHtmlText(priceMatch?.[1] || '')),
      url: absoluteUrl(urlMatch?.[1] || `/vn_vi/${pid}.html`),
      images
    })
  }
  return products
}

function categoryPidSet(html) {
  return new Set([...html.matchAll(/data-pid="([^"]+)"/gi)].map(match => decodeHtml(match[1])))
}

function primaryCategory(categories) {
  for (const preferred of ['Sạc ô tô điện', 'Phụ kiện xe máy điện', 'Phụ kiện ô tô xăng', 'Phong cách sống', 'Phụ kiện ô tô điện']) {
    if (categories.includes(preferred)) return preferred
  }
  return 'Phụ kiện khác'
}

async function fetchCatalogProducts() {
  const definitions = [...CATEGORY_DEFINITIONS, ...MODEL_DEFINITIONS]
  const [catalogHtml, ...categoryHtml] = await Promise.all([
    fetchText(`${GRID_URL}?cgid=phu-kien&sz=500`),
    ...definitions.map(item => fetchText(`${GRID_URL}?cgid=${encodeURIComponent(item.id)}&sz=500`))
  ])
  const products = parseGrid(catalogHtml)
  const memberships = new Map(definitions.map((item, index) => [item.id, categoryPidSet(categoryHtml[index])]))
  return products.map(product => {
    const categories = CATEGORY_DEFINITIONS
      .filter(item => memberships.get(item.id)?.has(product.pid))
      .map(item => item.name)
    const compatibleModels = MODEL_DEFINITIONS
      .filter(item => memberships.get(item.id)?.has(product.pid))
      .map(item => item.name)
    const publishedProduct = {
      ...product,
      category: primaryCategory(categories),
      categories,
      compatible_models: compatibleModels
    }
    return {
      ...publishedProduct,
      schema_version: CATALOG_TAXONOMY_SCHEMA_VERSION,
      collection_memberships: collectionMembershipsForProduct(publishedProduct)
    }
  })
}

function parseJsonLd(html) {
  for (const match of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const value = JSON.parse(match[1].trim())
      const candidates = Array.isArray(value) ? value : [value]
      const product = candidates.find(item => String(item?.['@type'] || '').toLowerCase() === 'product')
      if (product) return product
    } catch {}
  }
  return {}
}

function extractElementInnerHtml(html, tagName, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const opener = new RegExp(`<${tagName}\\b[^>]*class="[^"]*\\b${escaped}\\b[^"]*"[^>]*>`, 'i').exec(html)
  if (!opener) return ''
  const contentStart = opener.index + opener[0].length
  if (tagName.toLowerCase() !== 'div') {
    const closeIndex = html.toLowerCase().indexOf(`</${tagName.toLowerCase()}>`, contentStart)
    return closeIndex < 0 ? '' : html.slice(contentStart, closeIndex)
  }
  const tokenRegex = /<\/?div\b[^>]*>/gi
  let depth = 1
  for (const token of html.slice(contentStart).matchAll(tokenRegex)) {
    const value = token[0]
    if (/^<div\b/i.test(value)) depth += 1
    else depth -= 1
    if (depth === 0) return html.slice(contentStart, contentStart + token.index)
  }
  return ''
}

function parseServiceLabels(html) {
  return unique([...html.matchAll(/<div[^>]*class="[^"]*\bisReceiveShowroom\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)]
    .map(match => cleanHtmlText(match[1])))
}

function parseSpecifications(text) {
  const result = {}
  const scale = String(text || '').match(/tỉ lệ\s*(\d+)\s*:\s*(\d+)/i)
  if (scale) result['Tỉ lệ'] = `${scale[1]}:${scale[2]}`
  for (const originalLine of String(text || '').split('\n')) {
    const line = originalLine.replace(/^[-*•]\s*/, '').trim()
    const match = line.match(/^([^:]{2,60}):\s*(.+)$/)
    if (!match) continue
    const key = match[1].replace(/^\+\s*/, '').trim()
    const value = match[2].trim()
    if (!key || !value || /[.!?]$/.test(key) || /tỉ lệ\s*\d+$/i.test(key)) continue
    if (!result[key]) result[key] = value
    else if (result[key] !== value) result[key] = `${result[key]} / ${value}`
  }
  return result
}

function parseHiddenVariations(html) {
  const controls = new Set([...html.matchAll(/<ul[^>]*data-id="([^"]+)"/gi)].map(match => decodeHtml(match[1]).toLowerCase()))
  const variations = new Map()
  const regex = /<input[^>]*class="[^"]*\bvariations\b[^"]*"[^>]*value="([^"]+)"[^>]*>/gi
  for (const match of html.matchAll(regex)) {
    try {
      const value = JSON.parse(decodeHtml(match[1]))
      if (!value?.id || variations.has(value.id)) continue
      const attributes = {}
      if (value.color) {
        const key = controls.has('package') && !controls.has('color') ? 'package' : 'color'
        attributes[key] = String(value.color).trim()
      }
      if (value.size && controls.has('size')) attributes.size = String(value.size).trim()
      variations.set(value.id, {
        sku: value.id,
        stock_quantity: Number.isFinite(Number(value.qty)) ? Number(value.qty) : null,
        attributes
      })
    } catch {}
  }
  return [...variations.values()]
}

function variantChildSuffix(parentName, childName) {
  const cleanParent = String(parentName || '').trim()
  const cleanChild = String(childName || '').trim()
  const separated = cleanChild.match(/\s[-–—]\s([^–—]+)$/)
  if (separated?.[1]?.trim()) return separated[1].trim()
  if (cleanChild.toLocaleLowerCase('vi').startsWith(cleanParent.toLocaleLowerCase('vi'))) {
    const suffix = cleanChild.slice(cleanParent.length).replace(/^\s*[-–—:]\s*/, '').trim()
    if (suffix) return suffix
  }
  return ''
}

function variantDisplayName(parentName, childName, attributes) {
  const suffix = variantChildSuffix(parentName, childName)
  if (suffix) return suffix
  const values = Object.values(attributes || {}).filter(Boolean)
  return values.length ? values.join(' / ') : 'Mặc định'
}

async function fetchVariant(parentName, variation) {
  const url = `${BASE_URL}/vn_vi/${encodeURIComponent(variation.sku)}.html`
  const html = await fetchText(url)
  const jsonLd = parseJsonLd(html)
  const price = parsePriceNumber(jsonLd.offers?.price)
    || parsePriceNumber(cleanHtmlText(html.match(/class="price-sale"[^>]*>([\s\S]*?)<\/span>/i)?.[1] || ''))
  if (!price) throw new Error(`${variation.sku}: không đọc được giá variant`)
  const images = productImages(Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image])
  const quantity = variation.stock_quantity
  const jsonLdInStock = String(jsonLd.offers?.availability || '').includes('InStock')
  const childName = cleanHtmlText(jsonLd.name || '')
  const attributes = { ...variation.attributes }
  const childSuffix = variantChildSuffix(parentName, childName)
  if (attributes.package && childSuffix && /^(Signature|Premium|Luxury|First Royal)$/i.test(childSuffix)) {
    attributes.package = childSuffix
  }
  return {
    variant_id: variation.sku,
    sku: variation.sku,
    name: variantDisplayName(parentName, childName, attributes),
    attributes,
    price,
    formatted_price: formatMoney(price),
    images,
    image: images[0] || '',
    stock_quantity: quantity,
    in_stock: quantity == null ? jsonLdInStock : quantity > 0
  }
}

async function scrapeProduct(rawItem, crawledAt = new Date().toISOString()) {
  const html = await fetchText(rawItem.url)
  const jsonLd = parseJsonLd(html)
  const name = cleanHtmlText(jsonLd.name || rawItem.name || '')
  const hiddenVariations = parseHiddenVariations(html)
  let variants

  if (hiddenVariations.length) {
    variants = await mapLimit(hiddenVariations, 6, variation => fetchVariant(name, variation))
  } else {
    const price = parsePriceNumber(jsonLd.offers?.price) || rawItem.price
    if (!price) throw new Error(`${rawItem.pid}: không đọc được giá`)
    const images = productImages(Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image])
    variants = [{
      variant_id: jsonLd.sku || rawItem.pid,
      sku: jsonLd.sku || rawItem.pid,
      name: 'Mặc định',
      attributes: {},
      price,
      formatted_price: formatMoney(price),
      images,
      image: images[0] || rawItem.images[0] || '',
      stock_quantity: null,
      in_stock: String(jsonLd.offers?.availability || '').includes('InStock')
    }]
  }

  const prices = variants.map(variant => variant.price)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const jsonLdImages = productImages(Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image])
  const images = productImages([...jsonLdImages, ...rawItem.images, ...variants.flatMap(variant => variant.images)])
  if (!images.length) throw new Error(`${rawItem.pid}: không có ảnh`)

  const description = cleanHtmlText(extractElementInnerHtml(html, 'p', 'accessories-description-content'))
  const specificationText = cleanHtmlText(extractElementInnerHtml(html, 'div', 'specifications'))
    || cleanHtmlText(jsonLd.description || '')
  const policyNotes = cleanHtmlText(extractElementInnerHtml(html, 'div', 'policy-detail'))

  return {
    pid: rawItem.pid,
    sku: rawItem.pid,
    name,
    price: minPrice,
    formatted_price: formatMoney(minPrice),
    price_range: minPrice === maxPrice ? null : {
      min: minPrice,
      max: maxPrice,
      formatted: `${formatMoney(minPrice)} - ${formatMoney(maxPrice)}`
    },
    url: rawItem.url,
    category: rawItem.category,
    categories: rawItem.categories,
    compatible_models: rawItem.compatible_models,
    schema_version: rawItem.schema_version,
    collection_memberships: rawItem.collection_memberships,
    product_type: 'accessory',
    images,
    service_labels: parseServiceLabels(html),
    description: description || cleanHtmlText(jsonLd.description || ''),
    policy_notes: policyNotes,
    specifications: parseSpecifications(specificationText),
    specification_text: specificationText,
    variants,
    in_stock: variants.some(variant => variant.in_stock),
    source: {
      catalog: `${BASE_URL}/vn_vi/Parts`,
      detail: rawItem.url,
      crawled_at: crawledAt
    }
  }
}

export {
  CATALOG_TAXONOMY_SOURCE_SYSTEM,
  CATEGORY_DEFINITIONS,
  MODEL_DEFINITIONS,
  fetchCatalogProducts,
  mapLimit,
  parsePriceNumber,
  scrapeProduct
}
