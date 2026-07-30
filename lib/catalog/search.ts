const VIETNAMESE_D = /đ/gi
const COMBINING_MARKS = /[\u0300-\u036f]/g

/** Builds a safe raw tsquery matching name prefixes against an unaccented vector. */
export function toNamePrefixTsQuery(value: string | null): string | null {
  if (!value) return null
  const words = value
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(VIETNAMESE_D, (letter) => letter === 'Đ' ? 'D' : 'd')
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.slice(0, 20)

  return words?.length ? words.map((word) => `${word}:*`).join(' & ') : null
}
