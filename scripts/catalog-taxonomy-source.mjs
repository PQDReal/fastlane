export const CATALOG_TAXONOMY_SCHEMA_VERSION = 2
export const CATALOG_TAXONOMY_SOURCE_SYSTEM = 'VINFAST_DEMANDWARE'
export const CATALOG_TAXONOMY_ROOT_CATEGORY_SLUG = 'phu-kien'

export const CATEGORY_DEFINITIONS = [
  {
    sourceKey: '5003', name: 'Phong cách sống', slug: 'phong-cach-song',
    kind: 'CATEGORY', vehicleFilterMode: 'NONE', displayOrder: 10,
  },
  {
    sourceKey: 'Parts-Car', name: 'Phụ kiện ô tô điện', slug: 'phu-kien-o-to-dien',
    kind: 'CATEGORY', vehicleFilterMode: 'COLLECTION_MEMBERSHIP', displayOrder: 20,
  },
  {
    sourceKey: '5004', name: 'Sạc ô tô điện', slug: 'sac-o-to-dien',
    kind: 'CATEGORY', vehicleFilterMode: 'NONE', displayOrder: 30,
  },
  {
    sourceKey: 'Parts-eScooter', name: 'Phụ kiện xe máy điện', slug: 'phu-kien-xe-may-dien',
    kind: 'CATEGORY', vehicleFilterMode: 'NONE', displayOrder: 40,
  },
  {
    sourceKey: '6001', name: 'Phụ kiện ô tô xăng', slug: 'phu-kien-o-to-xang',
    kind: 'CATEGORY', vehicleFilterMode: 'NONE', displayOrder: 50,
  },
]

export const MODEL_DEFINITIONS = [
  { sourceKey: '5002', code: 'VF_9', name: 'VF 9', slug: 'vf-9', displayOrder: 10 },
  { sourceKey: '5001', code: 'VF_8', name: 'VF 8', slug: 'vf-8', displayOrder: 20 },
  { sourceKey: '5009', code: 'VF_7', name: 'VF 7', slug: 'vf-7', displayOrder: 30 },
  { sourceKey: '5008', code: 'VF_6', name: 'VF 6', slug: 'vf-6', displayOrder: 40 },
  { sourceKey: '5005', code: 'NERIO_GREEN', name: 'Nerio Green', slug: 'nerio-green', displayOrder: 50 },
  { sourceKey: '5010', code: 'LIMO_GREEN', name: 'Limo Green', slug: 'limo-green', displayOrder: 60 },
  { sourceKey: '5006', code: 'VF_5', name: 'VF 5', slug: 'vf-5', displayOrder: 70 },
  { sourceKey: '5007', code: 'VF_3', name: 'VF 3', slug: 'vf-3', displayOrder: 80 },
]

export const COLLECTION_DEFINITIONS = [
  ...CATEGORY_DEFINITIONS,
  ...MODEL_DEFINITIONS.map(model => ({
    sourceKey: model.sourceKey,
    name: model.name,
    slug: model.slug,
    kind: 'MODEL',
    vehicleFilterMode: 'COLLECTION_MEMBERSHIP',
    parentSourceKey: 'Parts-Car',
    vehicleModelCode: model.code,
    displayOrder: model.displayOrder,
  })),
]

const categoryByName = new Map(CATEGORY_DEFINITIONS.map(item => [item.name, item]))
const modelByName = new Map(MODEL_DEFINITIONS.map(item => [item.name, item]))

export function collectionMembershipsForProduct(product) {
  const categoryNames = Array.isArray(product.categories) ? product.categories : []
  const modelNames = Array.isArray(product.compatible_models) ? product.compatible_models : []
  const primaryName = typeof product.category === 'string' ? product.category : null
  const memberships = [
    ...categoryNames.map(name => {
      const definition = categoryByName.get(name)
      if (!definition) throw new Error(`${product.pid || product.name}: unknown source category ${name}`)
      return {
        source_system: CATALOG_TAXONOMY_SOURCE_SYSTEM,
        source_key: definition.sourceKey,
        kind: definition.kind,
        is_primary: definition.name === primaryName,
      }
    }),
    ...modelNames.map(name => {
      const definition = modelByName.get(name)
      if (!definition) throw new Error(`${product.pid || product.name}: unknown source model collection ${name}`)
      return {
        source_system: CATALOG_TAXONOMY_SOURCE_SYSTEM,
        source_key: definition.sourceKey,
        kind: 'MODEL',
        is_primary: false,
      }
    }),
  ]

  const primaryCount = memberships.filter(membership => membership.is_primary).length
  if (primaryCount !== 1) {
    throw new Error(`${product.pid || product.name}: expected one primary category membership, found ${primaryCount}`)
  }
  return memberships
}

export function taxonomyManifest({ crawledAt, expectedProducts }) {
  if (!crawledAt) throw new Error('Taxonomy manifest requires crawledAt')
  return {
    schema_version: CATALOG_TAXONOMY_SCHEMA_VERSION,
    source_system: CATALOG_TAXONOMY_SOURCE_SYSTEM,
    root_category_slug: CATALOG_TAXONOMY_ROOT_CATEGORY_SLUG,
    publication: {
      status: 'COMPLETE',
      crawled_at: crawledAt,
      expected_products: expectedProducts,
    },
    vehicle_models: MODEL_DEFINITIONS.map(model => ({
      code: model.code,
      slug: model.slug,
      name: model.name,
      vehicle_kind: 'CAR',
      is_active: true,
    })),
    collections: COLLECTION_DEFINITIONS.map(collection => ({
      source_key: collection.sourceKey,
      slug: collection.slug,
      name: collection.name,
      kind: collection.kind,
      parent_source_key: collection.parentSourceKey || null,
      vehicle_model_code: collection.vehicleModelCode || null,
      vehicle_filter_mode: collection.vehicleFilterMode,
      display_order: collection.displayOrder,
      is_active: true,
    })),
  }
}

export function validatePublishedTaxonomy(manifest, products) {
  const errors = []
  if (manifest?.schema_version !== CATALOG_TAXONOMY_SCHEMA_VERSION) {
    errors.push(`manifest schema_version must be ${CATALOG_TAXONOMY_SCHEMA_VERSION}`)
  }
  if (manifest?.source_system !== CATALOG_TAXONOMY_SOURCE_SYSTEM) {
    errors.push(`manifest source_system must be ${CATALOG_TAXONOMY_SOURCE_SYSTEM}`)
  }
  if (manifest?.root_category_slug !== CATALOG_TAXONOMY_ROOT_CATEGORY_SLUG) {
    errors.push(`manifest root_category_slug must be ${CATALOG_TAXONOMY_ROOT_CATEGORY_SLUG}`)
  }
  if (manifest?.publication?.status !== 'COMPLETE') errors.push('publication status must be COMPLETE')
  if (!Array.isArray(products)) errors.push('accessory publication must be an array')

  const collections = Array.isArray(manifest?.collections) ? manifest.collections : []
  const collectionKeys = new Set()
  const collectionByKey = new Map()
  for (const collection of collections) {
    if (!collection.source_key || collectionKeys.has(collection.source_key)) {
      errors.push(`duplicate or missing collection source_key ${collection.source_key || '(missing)'}`)
    }
    collectionKeys.add(collection.source_key)
    collectionByKey.set(collection.source_key, collection)
  }
  if (collectionKeys.size !== COLLECTION_DEFINITIONS.length) {
    errors.push(`collection count ${collectionKeys.size} != ${COLLECTION_DEFINITIONS.length}`)
  }
  for (const collection of collections) {
    if (collection.parent_source_key && !collectionKeys.has(collection.parent_source_key)) {
      errors.push(`collection ${collection.source_key} has unknown parent ${collection.parent_source_key}`)
    }
  }

  const modelCodes = new Set((manifest?.vehicle_models || []).map(model => model.code))
  if (modelCodes.size !== MODEL_DEFINITIONS.length) {
    errors.push(`vehicle model count ${modelCodes.size} != ${MODEL_DEFINITIONS.length}`)
  }
  for (const collection of collections) {
    if (collection.vehicle_model_code && !modelCodes.has(collection.vehicle_model_code)) {
      errors.push(`collection ${collection.source_key} has unknown vehicle model ${collection.vehicle_model_code}`)
    }
    const ancestors = new Set([collection.source_key])
    let parentKey = collection.parent_source_key
    while (parentKey) {
      if (ancestors.has(parentKey)) {
        errors.push(`collection ${collection.source_key} contains a hierarchy cycle`)
        break
      }
      ancestors.add(parentKey)
      parentKey = collectionByKey.get(parentKey)?.parent_source_key
    }
  }

  let categoryMemberships = 0
  let modelMemberships = 0
  for (const product of Array.isArray(products) ? products : []) {
    const key = product.pid || product.name || '(unknown product)'
    if (product.schema_version !== CATALOG_TAXONOMY_SCHEMA_VERSION) {
      errors.push(`${key}: schema_version must be ${CATALOG_TAXONOMY_SCHEMA_VERSION}`)
    }
    if (!Array.isArray(product.categories) || !Array.isArray(product.compatible_models)) {
      errors.push(`${key}: legacy taxonomy fields must remain dual-published`)
    }
    const memberships = Array.isArray(product.collection_memberships)
      ? product.collection_memberships
      : []
    const identities = new Set()
    for (const membership of memberships) {
      const identity = `${membership.source_system}:${membership.source_key}`
      if (identities.has(identity)) errors.push(`${key}: duplicate membership ${identity}`)
      identities.add(identity)
      if (membership.source_system !== manifest?.source_system) {
        errors.push(`${key}: membership has unexpected source_system ${membership.source_system}`)
      }
      if (!collectionKeys.has(membership.source_key)) {
        errors.push(`${key}: membership references unknown collection ${membership.source_key}`)
      }
      const collection = collectionByKey.get(membership.source_key)
      if (collection && membership.kind !== collection.kind) {
        errors.push(`${key}: membership kind differs for collection ${membership.source_key}`)
      }
      if (membership.is_primary && membership.kind !== 'CATEGORY') {
        errors.push(`${key}: only CATEGORY membership may be primary`)
      }
      if (membership.kind === 'CATEGORY') categoryMemberships += 1
      if (membership.kind === 'MODEL') modelMemberships += 1
    }
    if (memberships.filter(membership => membership.is_primary).length !== 1) {
      errors.push(`${key}: expected exactly one primary membership`)
    }
    try {
      const expectedIdentities = new Set(collectionMembershipsForProduct(product)
        .map(membership => `${membership.source_system}:${membership.source_key}`))
      if (expectedIdentities.size !== identities.size
        || [...expectedIdentities].some(identity => !identities.has(identity))) {
        errors.push(`${key}: normalized memberships differ from dual-published legacy labels`)
      }
    } catch (error) {
      errors.push(error.message)
    }
  }

  if (manifest?.publication?.expected_products !== products?.length) {
    errors.push(`publication expected_products ${manifest?.publication?.expected_products} != ${products?.length}`)
  }

  return {
    schemaVersion: manifest?.schema_version,
    products: Array.isArray(products) ? products.length : 0,
    collections: collectionKeys.size,
    vehicleModels: modelCodes.size,
    categoryMemberships,
    modelMemberships,
    errors,
  }
}
