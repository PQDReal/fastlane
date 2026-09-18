import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { createClient } from '@supabase/supabase-js'

import { validatePublishedTaxonomy } from './catalog-taxonomy-source.mjs'

const APPLY = process.argv.includes('--apply')
const RECONCILE = process.argv.includes('--reconcile')
const SOURCE_ONLY = process.argv.includes('--source-only')
const VERIFY = process.argv.includes('--verify')
const ACCESSORIES_FILE = path.join(process.cwd(), 'public', 'data', 'by_type', 'accessories.json')
const MANIFEST_FILE = path.join(process.cwd(), 'public', 'data', 'catalog', 'catalog-taxonomy.json')

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

async function checked(operation, context) {
  const result = await operation
  if (result.error) throw new Error(`${context}: ${result.error.message}`)
  return result.data
}

function productSourceKey(product) {
  const specifications = product.specifications
  if (!specifications || typeof specifications !== 'object' || Array.isArray(specifications)) return null
  return String(specifications.pid || specifications.sku || '').trim().toUpperCase() || null
}

function earlierTimestamp(left, right) {
  return Date.parse(left) <= Date.parse(right) ? left : right
}

function laterTimestamp(left, right) {
  return Date.parse(left) >= Date.parse(right) ? left : right
}

export function loadPublishedTaxonomy() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'))
  const products = JSON.parse(fs.readFileSync(ACCESSORIES_FILE, 'utf8'))
  const report = validatePublishedTaxonomy(manifest, products)
  if (report.errors.length > 0) {
    throw new Error(`Published catalog taxonomy is invalid:\n- ${report.errors.join('\n- ')}`)
  }
  return { manifest, products, report }
}

export function buildTaxonomyVerificationReport({ publication, database }) {
  const expectedCollectionKeys = new Set(publication.manifest.collections.map(row => row.source_key))
  const expectedModelCodes = new Set(publication.manifest.vehicle_models.map(row => row.code))
  const expectedMemberships = new Set(publication.products.flatMap(product => (
    product.collection_memberships.map(membership => (
      `${String(product.pid || product.sku).toUpperCase()}:${membership.source_system}:${membership.source_key}`
    ))
  )))
  const productPidById = new Map(database.products.map(product => [product.id, productSourceKey(product)]))
  const collectionById = new Map(database.collections.map(collection => [collection.id, collection]))
  const actualMemberships = new Set(database.memberships
    .filter(membership => membership.is_active)
    .map(membership => {
      const collection = collectionById.get(membership.collection_id)
      return `${productPidById.get(membership.product_id)}:${membership.source_system}:${collection?.source_key}`
    }))
  const missingProducts = publication.products
    .map(product => String(product.pid || product.sku).toUpperCase())
    .filter(pid => ![...productPidById.values()].includes(pid))
  const missingCollections = [...expectedCollectionKeys]
    .filter(key => !database.collections.some(row => row.is_active && row.source_key === key))
  const missingModels = [...expectedModelCodes]
    .filter(code => !database.vehicleModels.some(row => row.is_active && row.code === code))
  const missingMemberships = [...expectedMemberships].filter(identity => !actualMemberships.has(identity))
  const unexpectedMemberships = [...actualMemberships]
    .filter(identity => identity.includes(`:${publication.manifest.source_system}:`))
    .filter(identity => !expectedMemberships.has(identity))
  const primaryByProduct = new Map()
  for (const membership of database.memberships.filter(row => row.is_active && row.is_primary)) {
    const key = membership.product_id
    primaryByProduct.set(key, (primaryByProduct.get(key) || 0) + 1)
  }
  const invalidPrimaryProducts = database.products
    .filter(product => productPidById.get(product.id))
    .filter(product => primaryByProduct.get(product.id) !== 1)
    .map(product => productPidById.get(product.id))
  const errors = []
  for (const [name, rows] of Object.entries({
    missingProducts,
    missingCollections,
    missingModels,
    missingMemberships,
    unexpectedMemberships,
    invalidPrimaryProducts,
  })) {
    if (rows.length > 0) errors.push(`${name}: ${rows.length}`)
  }
  return {
    expected: publication.report,
    actual: {
      products: database.products.length,
      collections: database.collections.filter(row => row.is_active).length,
      vehicleModels: database.vehicleModels.filter(row => row.is_active).length,
      memberships: database.memberships.filter(row => row.is_active).length,
    },
    missingProducts,
    missingCollections,
    missingModels,
    missingMemberships,
    unexpectedMemberships,
    invalidPrimaryProducts,
    errors,
  }
}

function assertTaxonomyVerification(report) {
  if (report.errors.length > 0) {
    throw new Error(`Catalog taxonomy verification failed:\n- ${report.errors.join('\n- ')}`)
  }
}

async function loadDatabaseState(supabase, rootCategoryId, sourceSystem) {
  const [products, vehicleModels, collections, memberships] = await Promise.all([
    checked(
      supabase.from('products').select('id,specifications').eq('category_id', rootCategoryId).eq('is_active', true),
      'Load taxonomy products',
    ),
    checked(supabase.from('vehicle_models').select('*'), 'Load vehicle models'),
    checked(
      supabase.from('catalog_collections').select('*').eq('root_category_id', rootCategoryId),
      'Load catalog collections',
    ),
    checked(
      supabase.from('product_collection_memberships').select('*').eq('root_category_id', rootCategoryId).eq('source_system', sourceSystem),
      'Load product collection memberships',
    ),
  ])
  return { products, vehicleModels, collections, memberships }
}

async function backupTaxonomy(state) {
  const directory = path.join(process.cwd(), '.local', 'data', 'db-backups')
  const file = path.join(
    directory,
    `catalog-taxonomy-before-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  )
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify({ created_at: new Date().toISOString(), ...state }, null, 2)}\n`, 'utf8')
  console.log(`[BACKUP] ${path.relative(process.cwd(), file)}`)
}

async function upsertVehicleModels(supabase, manifest) {
  for (const model of manifest.vehicle_models) {
    await checked(
      supabase.from('vehicle_models').upsert({
        code: model.code,
        slug: model.slug,
        name: model.name,
        vehicle_kind: model.vehicle_kind,
        is_active: model.is_active,
        metadata: { sourceSystem: manifest.source_system },
      }, { onConflict: 'code' }),
      `Upsert vehicle model ${model.code}`,
    )
  }
}

async function upsertCollections(supabase, manifest, rootCategoryId) {
  const vehicleModels = await checked(
    supabase.from('vehicle_models').select('id,code'),
    'Reload vehicle models',
  )
  const modelByCode = new Map(vehicleModels.map(model => [model.code, model]))
  const ordered = [
    ...manifest.collections.filter(collection => !collection.parent_source_key),
    ...manifest.collections.filter(collection => collection.parent_source_key),
  ]
  for (const collection of ordered) {
    const parents = await checked(
      supabase.from('catalog_collections')
        .select('id,source_key')
        .eq('source_system', manifest.source_system)
        .eq('root_category_id', rootCategoryId),
      `Resolve parent for collection ${collection.source_key}`,
    )
    const parentBySourceKey = new Map(parents.map(parent => [parent.source_key, parent]))
    const vehicleModel = collection.vehicle_model_code
      ? modelByCode.get(collection.vehicle_model_code)
      : null
    if (collection.vehicle_model_code && !vehicleModel) {
      throw new Error(`Missing vehicle model ${collection.vehicle_model_code}`)
    }
    if (collection.parent_source_key && !parentBySourceKey.has(collection.parent_source_key)) {
      throw new Error(`Missing parent collection ${collection.parent_source_key}`)
    }
    await checked(
      supabase.from('catalog_collections').upsert({
        root_category_id: rootCategoryId,
        parent_id: collection.parent_source_key
          ? parentBySourceKey.get(collection.parent_source_key).id
          : null,
        vehicle_model_id: vehicleModel?.id || null,
        kind: collection.kind,
        source_system: manifest.source_system,
        source_key: collection.source_key,
        slug: collection.slug,
        name: collection.name,
        vehicle_filter_mode: collection.vehicle_filter_mode,
        display_order: collection.display_order,
        is_active: collection.is_active,
        metadata: { schemaVersion: manifest.schema_version },
      }, { onConflict: 'source_system,source_key' }),
      `Upsert collection ${collection.source_key}`,
    )
  }
}

async function upsertMemberships(supabase, publication, rootCategoryId) {
  const [products, collections, existingMemberships] = await Promise.all([
    checked(
      supabase.from('products').select('id,specifications').eq('category_id', rootCategoryId),
      'Resolve taxonomy products',
    ),
    checked(
      supabase.from('catalog_collections').select('id,source_key').eq('root_category_id', rootCategoryId).eq('source_system', publication.manifest.source_system),
      'Resolve taxonomy collections',
    ),
    checked(
      supabase.from('product_collection_memberships').select('id,product_id,collection_id,source_system,first_seen_at,is_active').eq('root_category_id', rootCategoryId).eq('source_system', publication.manifest.source_system),
      'Resolve existing taxonomy memberships',
    ),
  ])
  const productByPid = new Map(products.map(product => [productSourceKey(product), product]).filter(([pid]) => pid))
  const collectionBySourceKey = new Map(collections.map(collection => [collection.source_key, collection]))
  const existingByIdentity = new Map(existingMemberships.map(membership => [
    `${membership.product_id}:${membership.collection_id}:${membership.source_system}`,
    membership,
  ]))
  const expectedMembershipIds = new Set()
  const seenAt = publication.manifest.publication.crawled_at

  for (const sourceProduct of publication.products) {
    const pid = String(sourceProduct.pid || sourceProduct.sku).toUpperCase()
    const product = productByPid.get(pid)
    if (!product) throw new Error(`Missing database product for published accessory ${pid}`)
    for (const sourceMembership of sourceProduct.collection_memberships) {
      const collection = collectionBySourceKey.get(sourceMembership.source_key)
      if (!collection) throw new Error(`Missing collection ${sourceMembership.source_key}`)
      const identity = `${product.id}:${collection.id}:${sourceMembership.source_system}`
      const existing = existingByIdentity.get(identity)
      const row = await checked(
        supabase.from('product_collection_memberships').upsert({
          root_category_id: rootCategoryId,
          product_id: product.id,
          collection_id: collection.id,
          source_system: sourceMembership.source_system,
          is_primary: sourceMembership.is_primary,
          is_active: true,
          first_seen_at: existing ? earlierTimestamp(existing.first_seen_at, seenAt) : seenAt,
          last_seen_at: existing ? laterTimestamp(existing.last_seen_at, seenAt) : seenAt,
          metadata: { sourcePid: pid, schemaVersion: publication.manifest.schema_version },
        }, { onConflict: 'product_id,collection_id,source_system' }).select('id').single(),
        `Upsert membership ${pid}/${sourceMembership.source_key}`,
      )
      expectedMembershipIds.add(row.id)
    }
  }

  if (RECONCILE) {
    const staleIds = existingMemberships
      .filter(membership => membership.is_active && !expectedMembershipIds.has(membership.id))
      .map(membership => membership.id)
    if (staleIds.length > 0) {
      await checked(
        supabase.from('product_collection_memberships').update({ is_active: false }).in('id', staleIds),
        'Deactivate memberships absent from complete publication',
      )
    }
  }
}

async function reconcileCollections(supabase, manifest, rootCategoryId) {
  if (!RECONCILE) return
  const current = await checked(
    supabase.from('catalog_collections')
      .select('id,source_key,is_active')
      .eq('root_category_id', rootCategoryId)
      .eq('source_system', manifest.source_system),
    'Resolve collections absent from complete publication',
  )
  const expectedKeys = new Set(manifest.collections.map(collection => collection.source_key))
  const staleIds = current
    .filter(collection => collection.is_active && !expectedKeys.has(collection.source_key))
    .map(collection => collection.id)
  if (staleIds.length > 0) {
    await checked(
      supabase.from('catalog_collections').update({ is_active: false }).in('id', staleIds),
      'Deactivate collections absent from complete publication',
    )
  }
}

export async function main() {
  const publication = loadPublishedTaxonomy()
  console.log(JSON.stringify(publication.report, null, 2))
  if (SOURCE_ONLY) {
    console.log('Published taxonomy source verification complete; no database connection used.')
    return
  }
  if (RECONCILE && publication.manifest.publication.status !== 'COMPLETE') {
    throw new Error('Refusing to reconcile memberships from an incomplete publication')
  }

  const url = requiredEnvironment('NEXT_PUBLIC_SUPABASE_URL')
  assertDevelopmentTarget(url)
  const supabase = createClient(url, requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const rootCategory = await checked(
    supabase.from('categories').select('id,slug').eq('slug', publication.manifest.root_category_slug).maybeSingle(),
    'Load taxonomy root category',
  )
  if (!rootCategory) throw new Error(`Missing root category ${publication.manifest.root_category_slug}`)
  const before = await loadDatabaseState(
    supabase,
    rootCategory.id,
    publication.manifest.source_system,
  )
  const dryRunReport = buildTaxonomyVerificationReport({ publication, database: before })
  if (!APPLY) {
    console.log(JSON.stringify({ mode: 'dry-run', verification: dryRunReport }, null, 2))
    console.log('Dry run complete; no database rows changed.')
    if (VERIFY) assertTaxonomyVerification(dryRunReport)
    return
  }

  const publicationTime = Date.parse(publication.manifest.publication.crawled_at)
  const newestMembershipTime = Math.max(
    ...before.memberships.map(membership => Date.parse(membership.last_seen_at)).filter(Number.isFinite),
    Number.NEGATIVE_INFINITY,
  )
  if (newestMembershipTime > publicationTime) {
    throw new Error('Refusing to apply an older taxonomy publication over newer membership observations')
  }

  await backupTaxonomy(before)
  await upsertVehicleModels(supabase, publication.manifest)
  await upsertCollections(supabase, publication.manifest, rootCategory.id)
  await upsertMemberships(supabase, publication, rootCategory.id)
  await reconcileCollections(supabase, publication.manifest, rootCategory.id)

  const after = await loadDatabaseState(
    supabase,
    rootCategory.id,
    publication.manifest.source_system,
  )
  const finalReport = buildTaxonomyVerificationReport({ publication, database: after })
  console.log(JSON.stringify({ mode: RECONCILE ? 'apply-reconcile' : 'apply', verification: finalReport }, null, 2))
  assertTaxonomyVerification(finalReport)
}

const isMainModule = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isMainModule) {
  main().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
