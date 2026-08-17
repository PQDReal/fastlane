export type AdminVehicleVariantIdentity = {
  product_id?: string | null
  product_variant_id?: string | null
  product_type?: string | null
  sku?: string | null
  variant_name?: string | null
  version?: string | null
  color?: string | null
}

/**
 * A vehicle inventory row is usable only when it points to a sellable
 * product variant and has enough canonical vehicle metadata to identify the
 * version/color combination. Model-level placeholder rows stay out of both
 * admin inventory views.
 */
export function isAdminSellableVehicleVariant(row: AdminVehicleVariantIdentity) {
  const productType = String(row.product_type ?? '').toUpperCase()
  const hasVariantLabel = Boolean(
    String(row.sku ?? '').trim()
      || String(row.variant_name ?? '').trim()
      || String(row.version ?? '').trim(),
  )

  return ['CAR', 'BIKE'].includes(productType)
    && Boolean(row.product_variant_id)
    && hasVariantLabel
    && Boolean(String(row.color ?? '').trim())
}
