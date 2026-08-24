function normalizeManualModelText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/([a-z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([a-z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function inferManualModelSeries(
  query: string,
  availableSeries: readonly string[],
): string | undefined {
  const normalizedQuery = ` ${normalizeManualModelText(query)} `

  return [...new Set(availableSeries.filter(Boolean))]
    .map((series) => ({ series, normalized: normalizeManualModelText(series) }))
    .filter(({ normalized }) => normalized && normalizedQuery.includes(` ${normalized} `))
    .sort((left, right) => right.normalized.length - left.normalized.length)[0]?.series
}
