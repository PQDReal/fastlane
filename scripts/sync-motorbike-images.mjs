import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const applyChanges = process.argv.includes('--apply')

if (!url || !serviceRoleKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const manifestPath = path.join(
  process.cwd(),
  'scripts',
  'data',
  'motorbike-image-manifest.json',
)
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const manifestBySlug = new Map(manifest.map((product) => [product.slug, product]))
const imagePattern = /^https?:\/\/.+\.(?:avif|gif|jpe?g|png|svg|webp)(?:\?.*)?$/i

function orderedImages(product) {
  return [
    product.listingImage,
    product.heroImage,
    ...product.colors.flatMap((color) => [color.imageUrl, color.swatchUrl]),
    ...product.detailImages,
  ]
}

function validateManifestProduct(product) {
  const images = orderedImages(product)
  const expected = 2 + product.colors.length * 2 + 3
  const uniqueNames = new Set(
    product.colors.map((color) => color.name.trim().toLocaleLowerCase('vi')),
  )
  return {
    expected,
    images,
    valid:
      product.colors.length > 0
      && product.detailImages.length === 3
      && uniqueNames.size === product.colors.length
      && images.length === expected
      && images.every((image) => typeof image === 'string' && imagePattern.test(image)),
  }
}

for (const product of manifest) {
  const validation = validateManifestProduct(product)
  if (!validation.valid) {
    throw new Error(`Invalid image manifest for ${product.slug}`)
  }
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function loadMotorbikes() {
  const { data, error } = await supabase
    .from('products')
    .select('id,name,slug,image_urls,specifications,category:categories!inner(name)')
    .eq('is_active', true)
    .eq('categories.name', 'Xe máy điện')
    .order('name')

  if (error) throw new Error(`Unable to load motorbike images: ${error.message}`)
  return data ?? []
}

function inspectProduct(product) {
  const specifications = product.specifications
    && typeof product.specifications === 'object'
    && !Array.isArray(product.specifications)
    ? product.specifications
    : {}
  const details = Array.isArray(specifications.color_details)
    ? specifications.color_details
    : []
  const specificationMap = specifications.specs
    && typeof specifications.specs === 'object'
    && !Array.isArray(specifications.specs)
    ? specifications.specs
    : specifications
  const fallbackColors = String(specificationMap['Màu sắc'] ?? '')
    .split(/[;,]/)
    .map((value) => value.trim())
    .filter(Boolean)
  const colorCount = details.length || fallbackColors.length
  const images = Array.isArray(product.image_urls) ? product.image_urls : []
  const expected = 2 + colorCount * 2 + 3
  const validUrls = images.every(
    (value) => typeof value === 'string' && imagePattern.test(value),
  )

  return {
    specifications,
    details,
    fallbackColors,
    images,
    expected,
    validUrls,
    followsOrderedContract:
      colorCount > 0 && images.length === expected && validUrls,
  }
}

function writeReport(products) {
  const reportDirectory = path.join(process.cwd(), '.local', 'reports')
  const reportPath = path.join(reportDirectory, 'motorbike-image-contract.json')
  fs.mkdirSync(reportDirectory, { recursive: true })
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      contract: [
        'listing',
        'hero',
        'colorImage1',
        'swatch1',
        '...',
        'detail1',
        'detail2',
        'detail3',
      ],
      products: products.map((product) => {
        const inspection = inspectProduct(product)
        return {
          name: product.name,
          slug: product.slug,
          colorDetails: inspection.details,
          fallbackColors: inspection.fallbackColors,
          representativeImage: inspection.specifications.representative_image ?? null,
          detailImages: Array.isArray(inspection.specifications.detail_images)
            ? inspection.specifications.detail_images
            : [],
          imageUrls: inspection.images,
          expectedImages: inspection.expected,
          followsOrderedContract: inspection.followsOrderedContract,
        }
      }),
    }, null, 2)}\n`,
    'utf8',
  )
  return reportPath
}

function verifyCoverage(products) {
  const databaseSlugs = new Set(products.map((product) => product.slug))
  const missingFromManifest = [...databaseSlugs]
    .filter((slug) => !manifestBySlug.has(slug))
  const missingFromDatabase = [...manifestBySlug.keys()]
    .filter((slug) => !databaseSlugs.has(slug))

  if (missingFromManifest.length > 0 || missingFromDatabase.length > 0) {
    throw new Error(
      `Manifest/database mismatch. Missing manifest: ${missingFromManifest.join(', ') || 'none'}; `
      + `missing database: ${missingFromDatabase.join(', ') || 'none'}`,
    )
  }
}

function writeBackup(products) {
  const backupDirectory = path.join(process.cwd(), '.local', 'data', 'db-backups')
  const filename = `motorbike-images-before-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  const backupPath = path.join(backupDirectory, filename)
  fs.mkdirSync(backupDirectory, { recursive: true })
  fs.writeFileSync(
    backupPath,
    `${JSON.stringify({
      createdAt: new Date().toISOString(),
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        slug: product.slug,
        image_urls: product.image_urls,
        specifications: product.specifications,
      })),
    }, null, 2)}\n`,
    'utf8',
  )
  return backupPath
}

async function applyManifest(products) {
  const backupPath = writeBackup(products)
  console.log(`Backup: ${path.relative(process.cwd(), backupPath)}`)

  for (const product of products) {
    const source = manifestBySlug.get(product.slug)
    const specifications = product.specifications
      && typeof product.specifications === 'object'
      && !Array.isArray(product.specifications)
      ? product.specifications
      : {}
    const nextSpecifications = {
      ...specifications,
      color_details: source.colors.map((color) => ({
        color_name: color.name,
        image_url: color.imageUrl,
        swatch: color.swatchUrl,
      })),
      representative_image: source.heroImage,
      detail_images: source.detailImages,
    }
    const { error } = await supabase
      .from('products')
      .update({
        image_urls: orderedImages(source),
        specifications: nextSpecifications,
      })
      .eq('id', product.id)

    if (error) {
      throw new Error(`Unable to update ${product.slug}: ${error.message}`)
    }
    console.log(`[UPDATED] ${product.slug}`)
  }
}

let products = await loadMotorbikes()
verifyCoverage(products)

if (applyChanges) {
  await applyManifest(products)
  products = await loadMotorbikes()
}

const reportPath = writeReport(products)
const failures = products
  .map((product) => ({ product, inspection: inspectProduct(product) }))
  .filter(({ inspection }) => !inspection.followsOrderedContract)

console.log(`Checked ${products.length} active motorbikes.`)
console.log(`Report: ${path.relative(process.cwd(), reportPath)}`)

if (failures.length > 0) {
  console.error('Motorbike image contract failures:')
  for (const { product, inspection } of failures) {
    console.error(JSON.stringify({
      slug: product.slug,
      colors: inspection.details.length || inspection.fallbackColors.length,
      expectedImages: inspection.expected,
      actualImages: inspection.images.length,
      validUrls: inspection.validUrls,
    }))
  }
  if (!applyChanges) {
    console.error('Dry run only. Apply the reviewed manifest with:')
    console.error('npm run sync:motorbike-images:apply')
  }
  process.exitCode = 1
} else {
  console.log('All motorbike image_urls follow the ordered contract.')
}