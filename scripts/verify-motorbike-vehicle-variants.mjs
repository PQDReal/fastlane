import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRoleKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
  )
}

const supabase = createClient(
  url,
  serviceRoleKey,
  {
    auth: {
      persistSession: false,
    },
  },
)

const [
  productResult,
  productVariantResult,
  targetResult,
] = await Promise.all([
  supabase
    .from('products')
    .select(
      'id,name,slug,is_active,product_type,specifications,image_urls',
    )
    .in('product_type', ['BIKE', 'MOTORBIKE'])
    .eq('is_active', true)
    .order('name'),
  supabase
    .from('product_variants')
    .select(
      'id,product_id,sku,name,original_price,sale_price,deposit_amount,is_active',
    )
    .eq('is_active', true),
  supabase
    .from('vehicle_variants')
    .select('*')
    .eq('product_type', 'BIKE'),
])

for (const [label, result] of [
  ['products', productResult],
  ['product_variants', productVariantResult],
  ['vehicle_variants', targetResult],
]) {
  if (result.error) {
    throw new Error(`Unable to inspect ${label}: ${result.error.message}`)
  }
}

const products = productResult.data ?? []
const sourceVariants = productVariantResult.data ?? []
const currentTargets = targetResult.data ?? []
const sourceProductIds = new Set(
  products.map((product) => product.id),
)
const errors = []
const expectedByProduct = []

for (const product of products) {
  const specifications =
    product.specifications &&
    typeof product.specifications === 'object' &&
    !Array.isArray(product.specifications)
      ? product.specifications
      : {}
  const colors = Array.isArray(
    specifications.color_details,
  )
    ? specifications.color_details
    : []
  const images = Array.isArray(product.image_urls)
    ? product.image_urls
    : []
  const versions = sourceVariants.filter(
    (variant) =>
      variant.product_id === product.id,
  )
  const expectedImageCount =
    5 + colors.length * 2

  if (!product.slug?.trim()) {
    errors.push(`${product.name}: missing slug`)
  }
  if (colors.length === 0) {
    errors.push(
      `${product.name}: missing color_details`,
    )
  }
  if (images.length !== expectedImageCount) {
    errors.push(
      `${product.name}: expected ${expectedImageCount} ordered images, received ${images.length}`,
    )
  }
  if (versions.length === 0) {
    errors.push(
      `${product.name}: no active source version`,
    )
  }
  for (const version of versions) {
    if (
      !version.sku?.trim() ||
      !version.name?.trim() ||
      version.original_price === null
    ) {
      errors.push(
        `${product.name}: incomplete source version ${version.id}`,
      )
    }
  }

  expectedByProduct.push({
    product: product.name,
    versions: versions.length,
    colors: colors.length,
    expectedRows:
      versions.length * colors.length,
    currentRows: currentTargets.filter(
      (row) => row.product_id === product.id,
    ).length,
  })
}

const unrelatedTargetRows = currentTargets.filter(
  (row) => !sourceProductIds.has(row.product_id),
)
if (unrelatedTargetRows.length > 0) {
  errors.push(
    `${unrelatedTargetRows.length} BIKE target rows do not match an active motorbike product`,
  )
}

const expectedRows = expectedByProduct.reduce(
  (total, product) =>
    total + product.expectedRows,
  0,
)
const completeTargetRows = currentTargets.filter(
  (row) => {
    const catalog = row.specs?.catalog
    return (
    row.product_name?.trim() &&
    catalog?.product_slug?.trim() &&
    row.version?.trim() &&
    row.color?.trim() &&
    row.sku?.trim() &&
    row.price !== null &&
    row.deposit_amount !== null &&
    row.image_car_url?.trim() &&
    row.image_color_url?.trim() &&
    catalog?.listing_image_url?.trim() &&
    catalog?.hero_image_url?.trim() &&
    Array.isArray(catalog?.detail_image_urls) &&
    catalog.detail_image_urls.length === 3 &&
    row.specs &&
    typeof row.specs === 'object' &&
    !Array.isArray(row.specs)
    )
  },
)

console.log(
  JSON.stringify(
    {
      activeProducts: products.length,
      expectedRows,
      currentRows: currentTargets.length,
      completeCurrentRows:
        completeTargetRows.length,
      readyForRuntimeCutover:
        errors.length === 0 &&
        currentTargets.length === expectedRows &&
        completeTargetRows.length === expectedRows,
      products: expectedByProduct,
      sourceErrors: errors,
    },
    null,
    2,
  ),
)

if (errors.length > 0) {
  process.exitCode = 1
}
