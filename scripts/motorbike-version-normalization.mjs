function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function key(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi')
    .trim()
}

export function baseSku(value) {
  return text(value).replace(/(?:-C\d{2})+$/i, '')
}

function colorNames(colors) {
  return [...new Set((Array.isArray(colors) ? colors : [])
    .map((color) => text(color?.color_name ?? color?.name ?? color))
    .filter(Boolean))]
    .sort((left, right) => right.length - left.length)
}

function stripColorSuffix(value, colors) {
  let result = text(value)
  let changed = true

  while (changed) {
    changed = false
    const normalized = key(result)
    const color = colors.find((candidate) => normalized.endsWith(` - ${key(candidate)}`))
    if (color) {
      result = result.slice(0, -(color.length + 3)).trim()
      changed = true
    }
  }

  return result
}

function comparisonName(value) {
  return text(value).replace(/:\s*\d[\d.,]*(?:\s*(?:VNĐ|VND))?(?:\s*\([^)]*\))?$/i, '').trim()
}

export function normalizeVersionName({ productName, rawName, declaredVersions, colors }) {
  const raw = text(rawName)
  if (!raw) return ''

  const knownColors = colorNames(colors)
  const stripped = stripColorSuffix(raw, knownColors)
  const prefix = text(productName)
  const withoutProductPrefix = prefix && key(stripped).startsWith(`${key(prefix)} `)
    ? stripped.slice(prefix.length).trim()
    : stripped
  const declared = (Array.isArray(declaredVersions) ? declaredVersions : [])
    .map((version) => comparisonName(stripColorSuffix(text(version), knownColors)))
    .filter(Boolean)
  const rawKey = key(raw)
  const strippedKey = key(stripped)
  const withoutProductKey = key(withoutProductPrefix)
  const matchesDeclared = declared.find((version) => {
    const declaredKey = key(version)
    return rawKey === declaredKey
      || strippedKey === declaredKey
      || withoutProductKey === declaredKey
      || rawKey.startsWith(`${declaredKey} - `)
      || strippedKey.startsWith(`${declaredKey} - `)
      || withoutProductKey.startsWith(`${declaredKey} - `)
  })

  return matchesDeclared ? withoutProductPrefix : stripped
}

export function normalizeDeclaredVersions(values, colors) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => stripColorSuffix(text(value), colorNames(colors)))
    .filter(Boolean))]
}

/**
 * product_variants contains one inventory row per colour, and some historical
 * imports even contain a second colour suffix. Collapse those rows back to
 * one canonical version before generating vehicle_variants.
 */
export function selectCanonicalSourceVersions({ product, sourceVariants, overrides = {} }) {
  const specifications = product.specifications && typeof product.specifications === 'object'
    ? product.specifications
    : {}
  const colors = Array.isArray(specifications.color_details) ? specifications.color_details : []
  const declaredVersions = normalizeDeclaredVersions(specifications.variants, colors)
  const groups = new Map()

  for (const variant of sourceVariants
    .filter((row) => row.product_id === product.id)
    .sort((left, right) => String(left.sku).localeCompare(String(right.sku), 'en'))) {
    const sku = baseSku(variant.sku)
    const override = overrides[sku] ?? {}
    const normalized = normalizeVersionName({
      productName: product.name,
      rawName: override.name ?? variant.name,
      declaredVersions,
      colors,
    })
    const name = override.name ?? normalized
    if (!sku || !name) continue

    const identity = `${key(name)}|${key(sku)}`
    const current = groups.get(identity)
    const score = (variant.sku === sku ? 4 : 0)
      + (variant.deposit_amount !== null && variant.deposit_amount !== undefined ? 2 : 0)
      + (text(variant.name) === name ? 1 : 0)
    if (!current || score > current.score) {
      groups.set(identity, { ...variant, canonicalName: name, baseSku: sku, score })
    }
  }

  const order = new Map(declaredVersions.map((name, index) => [key(name), index]))
  return [...groups.values()]
    .sort((left, right) => {
      const leftOrder = order.get(key(left.canonicalName)) ?? Number.MAX_SAFE_INTEGER
      const rightOrder = order.get(key(right.canonicalName)) ?? Number.MAX_SAFE_INTEGER
      return leftOrder - rightOrder || left.baseSku.localeCompare(right.baseSku, 'en')
    })
    .map(({ score, ...variant }) => variant)
}
