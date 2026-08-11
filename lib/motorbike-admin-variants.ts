type ProductVariantRecord = {
  id?: string | null
  sku?: string | null
  name?: string | null
  original_price?: number | string | null
  deposit_amount?: number | string | null
  metadata?: Record<string, unknown> | null
}

type ColorRecord = {
  color_name?: string | null
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function key(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function baseSku(value: unknown) {
  return text(value).replace(/-C\d+$/i, '')
}

function versionName(
  variant: ProductVariantRecord,
  declaredVersions: string[],
  colors: ColorRecord[],
) {
  const metadataVersion = text(variant.metadata?.version)
  if (metadataVersion) return metadataVersion

  const rowName = text(variant.name)
  const declared = declaredVersions.find((name) => {
    const normalizedName = key(name)
    const normalizedRow = key(rowName)
    return normalizedRow === normalizedName || normalizedRow.startsWith(`${normalizedName} - `)
  })
  if (declared) return declared

  const matchingColor = colors
    .map((color) => text(color.color_name))
    .filter(Boolean)
    .find((color) => key(rowName).endsWith(` - ${key(color)}`))

  return matchingColor ? rowName.slice(0, -(matchingColor.length + 3)).trim() : rowName
}

/**
 * product_variants stores one inventory row per version + colour combination.
 * The Admin form, however, edits versions and colours as two independent lists.
 * Collapse combination rows back into one version before returning form state.
 */
export function reconstructMotorbikeAdminVersions(
  productVariants: ProductVariantRecord[],
  declaredVersions: unknown,
  colors: ColorRecord[],
) {
  const declared = Array.isArray(declaredVersions)
    ? declaredVersions.map(text).filter(Boolean)
    : []
  const grouped = new Map<string, {
    id?: string
    name: string
    sku: string
    price: number
    deposit_amount: number
  }>()

  for (const variant of productVariants) {
    const name = versionName(variant, declared, colors)
    const sku = baseSku(variant.sku)
    const identity = key(name) || key(sku)
    if (!identity || grouped.has(identity)) continue

    grouped.set(identity, {
      id: variant.id || undefined,
      name,
      sku,
      price: Number(variant.original_price ?? 0),
      deposit_amount: Number(variant.deposit_amount ?? 0),
    })
  }

  const order = new Map(declared.map((name, index) => [key(name), index]))
  return [...grouped.values()].sort((left, right) => {
    const leftOrder = order.get(key(left.name)) ?? Number.MAX_SAFE_INTEGER
    const rightOrder = order.get(key(right.name)) ?? Number.MAX_SAFE_INTEGER
    return leftOrder - rightOrder
  })
}
