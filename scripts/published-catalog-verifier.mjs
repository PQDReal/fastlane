function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizedSku(value) {
  return String(value || '').trim().toUpperCase()
}

function selectionSignature(selection) {
  return Object.entries(selection || {})
    .filter(([groupCode, valueCode]) => groupCode && valueCode)
    .map(([groupCode, valueCode]) => `${groupCode}=${valueCode}`)
    .sort()
    .join('|')
}

function duplicateGroups(rows, keyFor) {
  const groups = new Map()
  for (const row of rows) {
    const key = keyFor(row)
    if (!key) continue
    const matches = groups.get(key) || []
    matches.push(row)
    groups.set(key, matches)
  }
  return [...groups.entries()].filter(([, matches]) => matches.length > 1)
}

function productSummary(product) {
  return { id: product.id, name: product.name }
}

function variantSummary(variant, productById) {
  const product = productById.get(variant.product_id)
  return {
    id: variant.id,
    sku: variant.sku,
    productId: variant.product_id,
    productName: product?.name || null,
  }
}

export function sourceSelection(attributes) {
  return Object.fromEntries(Object.entries(attributes || {})
    .filter(([groupCode, valueName]) => groupCode && typeof valueName === 'string' && valueName.trim())
    .map(([groupCode, valueName]) => [groupCode, slugify(valueName)]))
}

export function buildVerificationReport({
  sources,
  products,
  variants,
  groups,
  values,
  mappings,
  media,
  inventory,
  productsWithoutMediaAllowlist = new Set(),
}) {
  const productById = new Map(products.map(product => [product.id, product]))
  const variantById = new Map(variants.map(variant => [variant.id, variant]))
  const groupById = new Map(groups.map(group => [group.id, group]))
  const valueById = new Map(values.map(value => [value.id, value]))
  const inventoryVariantIds = new Set(inventory.map(item => item.variant_id))
  const sourceCategorySlugs = new Set(sources.map(source => source.categorySlug))
  const sourceProductIds = new Set(sources.map(source => source.productId).filter(Boolean))

  const sourceProductsMissing = sources
    .filter(source => !source.productId || !productById.get(source.productId)?.is_active)
    .map(source => ({ name: source.name, productId: source.productId || null }))
  const matchedProducts = sources.length - sourceProductsMissing.length

  const sourceVariantRows = sources.flatMap(source => source.variants.map(variant => ({
    ...variant,
    sku: normalizedSku(variant.sku),
    sourceName: source.name,
    productId: source.productId,
    kind: source.kind,
    signature: selectionSignature(variant.selection),
  })))
  const sourceVariants = sourceVariantRows.length
  const variantsByProductAndSku = new Map()
  for (const variant of variants) {
    const key = `${variant.product_id}:${normalizedSku(variant.sku)}`
    const matches = variantsByProductAndSku.get(key) || []
    matches.push(variant)
    variantsByProductAndSku.set(key, matches)
  }

  const sourceVariantsMissing = []
  const matchedSourceVariants = []
  for (const expected of sourceVariantRows) {
    const matches = expected.productId
      ? variantsByProductAndSku.get(`${expected.productId}:${expected.sku}`) || []
      : []
    const activeMatches = matches.filter(variant => variant.is_active)
    if (activeMatches.length === 1) {
      matchedSourceVariants.push({ expected, variant: activeMatches[0] })
    } else {
      sourceVariantsMissing.push({
        productName: expected.sourceName,
        productId: expected.productId || null,
        sku: expected.sku,
        reason: activeMatches.length === 0 ? 'missing-or-inactive' : 'duplicate-active',
      })
    }
  }

  const duplicateSourceSkus = duplicateGroups(sourceVariantRows, variant => variant.sku).map(([sku, matches]) => ({
    sku,
    products: matches.map(match => match.sourceName),
  }))
  const duplicateDatabaseSkus = duplicateGroups(variants, variant => normalizedSku(variant.sku)).map(([sku, matches]) => ({
    sku,
    variants: matches.map(variant => variantSummary(variant, productById)),
  }))
  const duplicateSourceSignatures = duplicateGroups(
    sourceVariantRows.filter(variant => variant.signature),
    variant => `${variant.sourceName}:${variant.signature}`,
  ).map(([key, matches]) => ({
    productName: matches[0].sourceName,
    signature: key.slice(key.indexOf(':') + 1),
    skus: matches.map(match => match.sku),
  }))
  const duplicateDatabaseSignatures = duplicateGroups(
    variants.filter(variant => variant.is_active && variant.option_signature),
    variant => `${variant.product_id}:${variant.option_signature}`,
  ).map(([, matches]) => ({
    productId: matches[0].product_id,
    productName: productById.get(matches[0].product_id)?.name || null,
    signature: matches[0].option_signature,
    skus: matches.map(match => match.sku),
  }))

  const expectedVariantKeys = new Set(sourceVariantRows
    .filter(variant => variant.productId)
    .map(variant => `${variant.productId}:${variant.sku}`))
  const productsOutsideSource = products
    .filter(product => product.is_active
      && sourceCategorySlugs.has(product.category?.slug)
      && !sourceProductIds.has(product.id))
    .map(productSummary)
  const variantsOutsideSource = variants
    .filter(variant => {
      const product = productById.get(variant.product_id)
      return variant.is_active
        && product?.is_active
        && sourceCategorySlugs.has(product.category?.slug)
        && !expectedVariantKeys.has(`${variant.product_id}:${normalizedSku(variant.sku)}`)
    })
    .map(variant => variantSummary(variant, productById))

  const orphanValues = []
  for (const value of values) {
    const group = groupById.get(value.option_group_id)
    if (!group) {
      orphanValues.push({ valueId: value.id, reason: 'missing-group' })
    } else if (group.product_id !== value.product_id) {
      orphanValues.push({ valueId: value.id, reason: 'group-product-mismatch' })
    }
  }

  const mappingErrors = []
  const validSelectionsByVariant = new Map()
  const mappingGroupKeys = new Set()
  for (const mapping of mappings) {
    const variant = variantById.get(mapping.variant_id)
    const group = groupById.get(mapping.option_group_id)
    const value = valueById.get(mapping.option_value_id)
    const errors = []
    if (!variant) errors.push('missing-variant')
    if (!group) errors.push('missing-group')
    if (!value) errors.push('missing-value')
    if (variant && variant.product_id !== mapping.product_id) errors.push('variant-product-mismatch')
    if (group && group.product_id !== mapping.product_id) errors.push('group-product-mismatch')
    if (value && value.product_id !== mapping.product_id) errors.push('value-product-mismatch')
    if (value && value.option_group_id !== mapping.option_group_id) errors.push('value-group-mismatch')
    const variantGroupKey = `${mapping.variant_id}:${mapping.option_group_id}`
    if (mappingGroupKeys.has(variantGroupKey)) errors.push('duplicate-variant-group')
    mappingGroupKeys.add(variantGroupKey)
    if (errors.length > 0) {
      mappingErrors.push({
        variantId: mapping.variant_id,
        optionGroupId: mapping.option_group_id,
        optionValueId: mapping.option_value_id,
        reasons: errors,
      })
      continue
    }
    const selection = validSelectionsByVariant.get(mapping.variant_id) || {}
    selection[group.code] = value.code
    validSelectionsByVariant.set(mapping.variant_id, selection)
  }

  for (const { expected, variant } of matchedSourceVariants) {
    const expectedSignature = expected.signature
    const mappedSignature = selectionSignature(validSelectionsByVariant.get(variant.id) || {})
    if (mappedSignature !== expectedSignature) {
      mappingErrors.push({
        variantId: variant.id,
        sku: variant.sku,
        reason: 'source-selection-mismatch',
        expectedSignature,
        mappedSignature,
      })
    }
    if ((variant.option_signature || '') !== expectedSignature) {
      mappingErrors.push({
        variantId: variant.id,
        sku: variant.sku,
        reason: 'stored-signature-mismatch',
        expectedSignature,
        storedSignature: variant.option_signature,
      })
    }
  }

  for (const [variantId, selection] of validSelectionsByVariant) {
    const variant = variantById.get(variantId)
    if (!variant) continue
    const mappedSignature = selectionSignature(selection)
    if (variant.option_signature !== mappedSignature) {
      mappingErrors.push({
        variantId,
        sku: variant.sku,
        reason: 'mapped-variant-signature-mismatch',
        mappedSignature,
        storedSignature: variant.option_signature,
      })
    }
  }

  const mediaProductMismatches = []
  for (const item of media) {
    const reasons = []
    const variant = item.variant_id ? variantById.get(item.variant_id) : null
    const value = item.option_value_id ? valueById.get(item.option_value_id) : null
    if (item.variant_id && !variant) reasons.push('missing-variant')
    if (item.option_value_id && !value) reasons.push('missing-value')
    if (variant && variant.product_id !== item.product_id) reasons.push('variant-product-mismatch')
    if (value && value.product_id !== item.product_id) reasons.push('value-product-mismatch')
    if (reasons.length > 0) mediaProductMismatches.push({ mediaId: item.id, reasons })
  }

  const activeMediaProductIds = new Set(media.filter(item => item.is_active).map(item => item.product_id))
  const productsWithoutMedia = sources
    .filter(source => source.productId && !activeMediaProductIds.has(source.productId))
    .map(source => ({ id: source.productId, name: source.name }))
  const productsWithoutRequiredMedia = productsWithoutMedia
    .filter(product => !productsWithoutMediaAllowlist.has(product.name))

  const activeAccessoryVariantsMissingInventory = matchedSourceVariants
    .filter(({ expected, variant }) => expected.kind === 'accessory'
      && variant.is_active
      && !inventoryVariantIds.has(variant.id))
    .map(({ variant }) => variantSummary(variant, productById))

  const integrity = {
    sourceProductsMissing,
    sourceVariantsMissing,
    duplicateSourceSkus,
    duplicateDatabaseSkus,
    duplicateSourceSignatures,
    duplicateDatabaseSignatures,
    orphanValues,
    mappingErrors,
    mediaProductMismatches,
    activeAccessoryVariantsMissingInventory,
    productsWithoutRequiredMedia,
  }
  const errors = []
  if (matchedProducts !== sources.length) errors.push(`matchedProducts ${matchedProducts} != sourceProducts ${sources.length}`)
  if (matchedSourceVariants.length !== sourceVariants) {
    errors.push(`matchedVariants ${matchedSourceVariants.length} != sourceVariants ${sourceVariants}`)
  }
  for (const [name, rows] of Object.entries(integrity)) {
    if (rows.length > 0) errors.push(`${name}: ${rows.length}`)
  }
  if (productsOutsideSource.length > 0) errors.push(`productsOutsideSource: ${productsOutsideSource.length}`)
  if (variantsOutsideSource.length > 0) errors.push(`variantsOutsideSource: ${variantsOutsideSource.length}`)

  return {
    sourceProducts: sources.length,
    matchedProducts,
    sourceVariants,
    matchedVariants: matchedSourceVariants.length,
    groups: groups.length,
    values: values.length,
    mappings: mappings.length,
    media: media.length,
    productsWithoutMedia,
    productsOutsideSource,
    variantsOutsideSource,
    integrity,
    errors,
  }
}

export function assertVerification(report) {
  if (report.errors.length > 0) {
    throw new Error(`Catalog verification failed:\n- ${report.errors.join('\n- ')}`)
  }
}
