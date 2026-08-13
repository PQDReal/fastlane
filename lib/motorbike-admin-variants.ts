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

type VehicleVariantRecord = {
  product_variant_id?: string | null
  version?: string | null
  color?: string | null
  sku?: string | null
  price?: number | string | null
  deposit_amount?: number | string | null
}

import { normalizeMotorbikeVersionName } from '@/lib/motorbike-version'

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
  productName = '',
) {
  const metadataVersion = text(variant.metadata?.version)
  if (metadataVersion) {
    return normalizeMotorbikeVersionName(metadataVersion, declaredVersions, colors, productName)
  }

  const rowName = text(variant.name)
  return normalizeMotorbikeVersionName(rowName, declaredVersions, colors, productName)
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
  productName = '',
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
    const name = versionName(variant, declared, colors, productName)
    const sku = baseSku(variant.metadata?.base_sku ?? variant.sku)
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

/** Rebuild the Admin model from canonical sellable vehicle configurations. */
export function reconstructMotorbikeAdminConfiguration(input: {
  productVariants: ProductVariantRecord[]
  vehicleVariants: VehicleVariantRecord[]
  inventoryByVariantId: Map<string, number>
  declaredVersions?: unknown
  colors: ColorRecord[]
  productName?: string
}) {
  const productVariantById = new Map(input.productVariants
    .filter((row) => row.id)
    .map((row) => [String(row.id), row]))
  const versions = new Map<string, {
    id?: string
    name: string
    sku: string
    price: number
    deposit_amount: number
    compatible_colors: string[]
    stock_by_color: Record<string, number>
  }>()

  for (const row of input.vehicleVariants) {
    const name = normalizeMotorbikeVersionName(
      row.version,
      Array.isArray(input.declaredVersions) ? input.declaredVersions : [],
      input.colors,
      input.productName,
    )
    const color = text(row.color)
    if (!name || !color) continue
    const linked = row.product_variant_id
      ? productVariantById.get(String(row.product_variant_id))
      : undefined
    const identity = key(name)
    if (!versions.has(identity)) {
      versions.set(identity, {
        id: linked?.id || undefined,
        name,
        sku: baseSku(linked?.metadata?.base_sku ?? linked?.sku ?? row.sku),
        price: Number(row.price ?? linked?.original_price ?? 0),
        deposit_amount: Number(row.deposit_amount ?? linked?.deposit_amount ?? 0),
        compatible_colors: [],
        stock_by_color: {},
      })
    }
    const version = versions.get(identity)!
    if (!version.compatible_colors.includes(color)) version.compatible_colors.push(color)
    version.stock_by_color[color] = row.product_variant_id
      ? input.inventoryByVariantId.get(String(row.product_variant_id)) ?? 0
      : 0
  }

  if (versions.size === 0) {
    return reconstructMotorbikeAdminVersions(input.productVariants, input.declaredVersions, input.colors, input.productName)
      .map((version) => {
        const exactRows = input.productVariants.filter((row) =>
          text(row.metadata?.version) === version.name && text(row.metadata?.color))
        const compatibleColors = Array.from(new Set(exactRows
          .map((row) => text(row.metadata?.color)).filter(Boolean)))
        return {
          ...version,
          compatible_colors: compatibleColors.length > 0
            ? compatibleColors
            : input.colors.map((color) => text(color.color_name)).filter(Boolean),
          stock_by_color: Object.fromEntries(exactRows.map((row) => [
            text(row.metadata?.color),
            row.id ? input.inventoryByVariantId.get(String(row.id)) ?? 0 : 0,
          ])),
        }
      })
  }

  const declared = Array.isArray(input.declaredVersions)
    ? input.declaredVersions.map(text).filter(Boolean)
    : []
  const order = new Map(declared.map((name, index) => [key(name), index]))
  return [...versions.values()].sort((left, right) =>
    (order.get(key(left.name)) ?? Number.MAX_SAFE_INTEGER)
      - (order.get(key(right.name)) ?? Number.MAX_SAFE_INTEGER))
}
