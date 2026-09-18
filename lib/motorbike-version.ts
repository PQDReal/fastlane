type MotorbikeColor = string | { color_name?: unknown }

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function key(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi')
    .trim()
}

function colorNames(colors: MotorbikeColor[]) {
  return [...new Set(colors
    .map((color) => typeof color === 'string' ? color : text(color?.color_name))
    .map(text)
    .filter(Boolean))]
    .sort((left, right) => right.length - left.length)
}

function stripColorSuffix(value: string, colors: string[]) {
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

function comparisonName(value: string) {
  return value.replace(/:\s*\d[\d.,]*(?:\s*(?:VNĐ|VND))?(?:\s*\([^)]*\))?$/i, '').trim()
}

/**
 * Converts legacy motorbike version labels to the canonical version label.
 * A colour is a separate selection and must never become part of `version`.
 */
export function normalizeMotorbikeVersionName(
  value: unknown,
  declaredVersions: unknown[] = [],
  colors: MotorbikeColor[] = [],
  productName = '',
) {
  const raw = text(value)
  if (!raw) return ''

  const knownColors = colorNames(colors)
  const stripped = stripColorSuffix(raw, knownColors)
  const productPrefix = text(productName)
  const withoutProductPrefix = productPrefix && key(stripped).startsWith(`${key(productPrefix)} `)
    ? stripped.slice(productPrefix.length).trim()
    : stripped

  const declared = declaredVersions
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

export function normalizeDeclaredMotorbikeVersions(
  declaredVersions: unknown,
  colors: MotorbikeColor[] = [],
) {
  if (!Array.isArray(declaredVersions)) return []
  return [...new Set(declaredVersions
    .map((version) => stripColorSuffix(text(version), colorNames(colors)))
    .filter(Boolean))]
}
