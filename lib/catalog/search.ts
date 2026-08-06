const VIETNAMESE_D = /đ/gi
const COMBINING_MARKS = /[\u0300-\u036f]/g
const LETTER_BEFORE_NUMBER = /([a-z])([0-9])/g
const NUMBER_BEFORE_LETTER = /([0-9])([a-z])/g
const NON_SEARCH_CHARACTER = /[^a-z0-9]+/g

/**
 * Produces the canonical form used by the UI, Redis and PostgreSQL search.
 * Product codes typed with or without separators are intentionally equivalent:
 * `VF9`, `VF-9` and `VF 9` all become `vf 9`.
 */
export function normalizeProductSearchText(value: string | null | undefined) {
  if (!value) return ''

  return value
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .replace(VIETNAMESE_D, (letter) => letter === 'Đ' ? 'D' : 'd')
    .toLowerCase()
    .replace(LETTER_BEFORE_NUMBER, '$1 $2')
    .replace(NUMBER_BEFORE_LETTER, '$1 $2')
    .replace(NON_SEARCH_CHARACTER, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Builds a safe raw tsquery matching name prefixes against an unaccented vector. */
export function toNamePrefixTsQuery(value: string | null): string | null {
  const words = normalizeProductSearchText(value)
    .split(' ')
    .filter(Boolean)
    .slice(0, 20)

  return words?.length ? words.map((word) => `${word}:*`).join(' & ') : null
}

/** Matches every normalized query token against a name token prefix. */
export function matchesProductSearch(
  productName: string | null | undefined,
  query: string | null | undefined,
) {
  const queryTokens = normalizeProductSearchText(query).split(' ').filter(Boolean)
  if (queryTokens.length === 0) return true

  const nameTokens = normalizeProductSearchText(productName).split(' ').filter(Boolean)
  return queryTokens.every((queryToken) =>
    nameTokens.some((nameToken) => nameToken.startsWith(queryToken)),
  )
}
