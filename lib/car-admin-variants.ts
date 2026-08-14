type ProductVariantRecord = {
  id?: string | null
  sku?: string | null
  name?: string | null
  original_price?: number | string | null
  deposit_amount?: number | string | null
  metadata?: Record<string, any> | null
}

type VehicleVariantRecord = {
  product_variant_id?: string | null
  version?: string | null
  color?: string | null
  sku?: string | null
  price?: number | string | null
  deposit_amount?: number | string | null
  specs?: Record<string, any> | null
  interior_color?: string | null
  color_type?: 'STANDARD' | 'ADVANCED' | null
  color_price_adjustment?: number | string | null
}

type NamedColor = { color_name?: string | null }
type NamedInterior = {
  interior_name?: string | null
  image_url?: string | null
  swatch?: string | null
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function key(value: unknown) {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function slugPart(value: unknown) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toUpperCase()
}

function stripColorFromSku(sku: unknown, color: unknown) {
  const raw = text(sku)
  const suffix = slugPart(color)
  return suffix && raw.toUpperCase().endsWith(`-${suffix}`)
    ? raw.slice(0, -(suffix.length + 1))
    : raw.replace(/-C\d{2}-I\d{2}$/i, '')
}

function vehicleInteriors(row: VehicleVariantRecord) {
  const columnInterior = text(row.interior_color)
  if (columnInterior) {
    return [{
      interior_name: columnInterior,
      image_url: text(row.specs?.catalog?.interior_image_url),
      swatch: text(row.specs?.catalog?.interior_swatch_url),
    }]
  }
  const catalogInterior = text(row.specs?.catalog?.interior_color)
  if (catalogInterior) {
    return [{
      interior_name: catalogInterior,
      image_url: text(row.specs?.catalog?.interior_image_url),
      swatch: text(row.specs?.catalog?.interior_swatch_url),
    }]
  }

  return (Array.isArray(row.specs?.interior_colors) ? row.specs?.interior_colors : [])
    .map((interior: any) => ({
      interior_name: text(interior?.name),
      image_url: text(interior?.images?.[0] ?? interior?.image),
      swatch: text(interior?.swatch),
    }))
    .filter((interior: NamedInterior) => interior.interior_name)
}

function findBaseVariant(
  versionName: string,
  rows: ProductVariantRecord[],
  linkedVariant?: ProductVariantRecord,
) {
  if (text(linkedVariant?.metadata?.base_sku)) return linkedVariant

  const normalizedVersion = key(versionName)
  return rows.find((row) => {
    const publishedVersion = key(row.metadata?.publishedAttributes?.version)
    const rowName = key(row.name)
    return publishedVersion.endsWith(normalizedVersion)
      || rowName === normalizedVersion
      || rowName.endsWith(` ${normalizedVersion}`)
  })
}

/**
 * vehicle_variants is the canonical car configuration source. Legacy
 * product_variants contains one row named after every colour, so grouping by
 * product_variants.name incorrectly turns colours into separate versions.
 */
export function reconstructCarAdminConfiguration(input: {
  productVariants: ProductVariantRecord[]
  vehicleVariants: VehicleVariantRecord[]
  inventoryByVariantId: Map<string, number>
  declaredVersions?: unknown
  colors: NamedColor[]
  interiors: NamedInterior[]
}) {
  const productVariantById = new Map(input.productVariants
    .filter((row) => row.id)
    .map((row) => [String(row.id), row]))
  const declared = Array.isArray(input.declaredVersions)
    ? input.declaredVersions.map(text).filter(Boolean)
    : []
  const inferredInteriors = new Map(input.interiors
    .filter((row: any) => text(row.interior_name))
    .map((row: any) => [key(row.interior_name), {
      interior_name: text(row.interior_name),
      image_url: text(row.image_url),
      swatch: text(row.swatch),
      image_urls: row.image_urls || [],
      allowed_combinations: row.allowed_combinations || [],
    }]))
  const versions = new Map<string, any>()

  for (const row of input.vehicleVariants) {
    const versionName = text(row.version)
    const exterior = text(row.color)
    if (!versionName || !exterior) continue

    const linkedVariant = row.product_variant_id
      ? productVariantById.get(String(row.product_variant_id))
      : undefined
    const baseVariant = findBaseVariant(versionName, input.productVariants, linkedVariant)
    const identity = key(versionName)
    if (!versions.has(identity)) {
      versions.set(identity, {
        id: linkedVariant?.id || baseVariant?.id || undefined,
        name: versionName,
        sku: text(linkedVariant?.metadata?.base_sku)
          || text(baseVariant?.sku)
          || stripColorFromSku(row.sku ?? linkedVariant?.sku, exterior),
        price: Number(row.price ?? linkedVariant?.original_price ?? baseVariant?.original_price ?? 0),
        deposit_amount: Number(row.deposit_amount ?? linkedVariant?.deposit_amount ?? baseVariant?.deposit_amount ?? 0),
        compatible_colors: [],
        interiors_by_color: {},
        stock_by_configuration: {},
      })
    }

    const version = versions.get(identity)
    if (!version.compatible_colors.includes(exterior)) version.compatible_colors.push(exterior)
    // A version has one base price. Advanced exterior colours receive the
    // product-level surcharge; do not reconstruct a separate price per colour.
    version.price = Math.min(
      Number(version.price || Number.MAX_SAFE_INTEGER),
      Number(row.price ?? linkedVariant?.original_price ?? baseVariant?.original_price ?? version.price),
    )

    let interiors = vehicleInteriors(row)
    if (interiors.length === 0 && input.interiors.length === 1) {
      interiors = input.interiors.map((interior) => ({
        interior_name: text(interior.interior_name),
        image_url: text(interior.image_url),
        swatch: text(interior.swatch),
      }))
    }
    version.interiors_by_color[exterior] = Array.from(new Set([
      ...(version.interiors_by_color[exterior] || []),
      ...interiors.map((interior) => text(interior.interior_name)).filter(Boolean),
    ]))

    for (const interior of interiors) {
      const interiorName = text(interior.interior_name)
      if (!interiorName) continue
      const existing = inferredInteriors.get(key(interiorName))
      inferredInteriors.set(key(interiorName), {
        interior_name: interiorName,
        image_url: text(interior.image_url) || existing?.image_url || '',
        swatch: text(interior.swatch) || existing?.swatch || '',
        image_urls: existing?.image_urls || [],
        allowed_combinations: existing?.allowed_combinations || [],
      })
      version.stock_by_configuration[JSON.stringify([exterior, interiorName])] = row.product_variant_id
        ? input.inventoryByVariantId.get(String(row.product_variant_id)) ?? 0
        : 0
    }
  }

  // New Admin rows already carry exact metadata. Keep this fallback for
  // products that have not been mirrored into vehicle_variants yet.
  if (versions.size === 0) {
    for (const row of input.productVariants) {
      const versionName = text(row.metadata?.version)
      const exterior = text(row.metadata?.color)
      const interior = text(row.metadata?.interior_color)
      if (!versionName || !exterior || !interior) continue
      const identity = key(versionName)
      if (!versions.has(identity)) {
        versions.set(identity, {
          id: row.id || undefined,
          name: versionName,
          sku: text(row.metadata?.base_sku) || stripColorFromSku(row.sku, exterior),
          price: Number(row.original_price ?? 0),
          deposit_amount: Number(row.deposit_amount ?? 0),
          compatible_colors: [],
          interiors_by_color: {},
          stock_by_configuration: {},
        })
      }
      const version = versions.get(identity)
      if (!version.compatible_colors.includes(exterior)) version.compatible_colors.push(exterior)
      version.price = Math.min(Number(version.price || Number.MAX_SAFE_INTEGER), Number(row.original_price ?? version.price))
      version.interiors_by_color[exterior] = Array.from(new Set([
        ...(version.interiors_by_color[exterior] || []),
        interior,
      ]))
      version.stock_by_configuration[JSON.stringify([exterior, interior])] = row.id
        ? input.inventoryByVariantId.get(String(row.id)) ?? 0
        : 0
    }
  }

  const order = new Map(declared.map((name, index) => [key(name), index]))
  const reconstructedVersions = [...versions.values()].sort((left, right) =>
    (order.get(key(left.name)) ?? Number.MAX_SAFE_INTEGER)
      - (order.get(key(right.name)) ?? Number.MAX_SAFE_INTEGER))

  return {
    versions: reconstructedVersions,
    interiors: [...inferredInteriors.values()],
  }
}
