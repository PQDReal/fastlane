import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import {
  CATALOG_TAXONOMY_SCHEMA_VERSION,
  collectionMembershipsForProduct,
  taxonomyManifest,
  validatePublishedTaxonomy,
} from './catalog-taxonomy-source.mjs'

const APPLY = process.argv.includes('--write')
const BY_TYPE_FILE = path.join(process.cwd(), 'public', 'data', 'by_type', 'accessories.json')
const MASTER_FILE = path.join(process.cwd(), 'public', 'data', 'master_products.json')
const MANIFEST_FILE = path.join(process.cwd(), 'public', 'data', 'catalog', 'catalog-taxonomy.json')

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function publishedAt(products) {
  const timestamps = products
    .map(product => product.source?.crawled_at)
    .filter(value => typeof value === 'string' && !Number.isNaN(Date.parse(value)))
    .sort()
  if (timestamps.length === 0) throw new Error('Accessory publication has no valid source.crawled_at')
  return timestamps.at(-1)
}

function upgradeProducts(products) {
  return products.map(product => ({
    ...product,
    schema_version: CATALOG_TAXONOMY_SCHEMA_VERSION,
    collection_memberships: collectionMembershipsForProduct(product),
  }))
}

export function buildPublication() {
  const accessories = upgradeProducts(readJson(BY_TYPE_FILE))
  const master = readJson(MASTER_FILE)
  const masterAccessories = upgradeProducts(master.accessories || [])
  const byTypeKeys = accessories.map(product => product.pid)
  const masterKeys = masterAccessories.map(product => product.pid)
  if (JSON.stringify(byTypeKeys) !== JSON.stringify(masterKeys)) {
    throw new Error('master_products accessories differ from public/data/by_type/accessories.json')
  }
  const manifest = taxonomyManifest({
    crawledAt: publishedAt(accessories),
    expectedProducts: accessories.length,
  })
  const report = validatePublishedTaxonomy(manifest, accessories)
  if (report.errors.length > 0) {
    throw new Error(`Taxonomy v2 publication is invalid:\n- ${report.errors.join('\n- ')}`)
  }
  return { accessories, master: { ...master, accessories: masterAccessories }, manifest, report }
}

export function main() {
  const publication = buildPublication()
  console.log(JSON.stringify(publication.report, null, 2))
  if (!APPLY) {
    console.log('Validation complete; rerun with --write to publish schema v2 files.')
    return
  }
  fs.mkdirSync(path.dirname(MANIFEST_FILE), { recursive: true })
  fs.writeFileSync(BY_TYPE_FILE, `${JSON.stringify(publication.accessories, null, 2)}\n`, 'utf8')
  fs.writeFileSync(MASTER_FILE, `${JSON.stringify(publication.master, null, 2)}\n`, 'utf8')
  fs.writeFileSync(MANIFEST_FILE, `${JSON.stringify(publication.manifest, null, 2)}\n`, 'utf8')
  console.log(`Published schema v2: ${path.relative(process.cwd(), MANIFEST_FILE)}`)
}

const isMainModule = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isMainModule) {
  try {
    main()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
