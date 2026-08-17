function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function slugPart(value: unknown) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toUpperCase()
}

/**
 * Returns the version-level SKU, removing legacy colour/interior suffixes.
 * This keeps old imported rows from producing values such as BASE-C01-C01.
 */
export function normalizeCarSkuBase(value: unknown, color?: unknown, interior?: unknown) {
  let result = text(value)
  if (!result) return ''

  const suffixes = [slugPart(interior), slugPart(color)].filter(Boolean)
  for (const suffix of suffixes) {
    if (result.toUpperCase().endsWith(`-${suffix}`)) {
      result = result.slice(0, -(suffix.length + 1))
    }
  }

  return result.replace(/-C\d+(?:-I\d+)?$/i, '')
}
