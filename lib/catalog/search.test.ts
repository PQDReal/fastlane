import { describe, expect, it } from 'vitest'

import {
  matchesProductSearch,
  normalizeProductSearchText,
  toNamePrefixTsQuery,
} from '@/lib/catalog/search'

describe('name-only prefix search query', () => {
  it('unaccents Vietnamese text consistently with the database vector', () => {
    expect(toNamePrefixTsQuery('Điện thoại')).toBe('dien:* & thoai:*')
  })

  it('removes tsquery operators and rejects empty input', () => {
    expect(toNamePrefixTsQuery("VF 3' | !:*" )).toBe('vf:* & 3:*')
    expect(toNamePrefixTsQuery('---')).toBeNull()
  })

  it('treats punctuation, spacing, casing and letter-number boundaries equally', () => {
    const expected = 'vinfast vf 9'
    expect(normalizeProductSearchText('VinFast VF9')).toBe(expected)
    expect(normalizeProductSearchText(' VINFAST...VF--9 ')).toBe(expected)
    expect(normalizeProductSearchText('vinfast   vf 9')).toBe(expected)
    expect(toNamePrefixTsQuery('VinFast VF9')).toBe('vinfast:* & vf:* & 9:*')
  })

  it('uses the same canonical matching for motorbike names', () => {
    expect(matchesProductSearch('VinFast Evo Grand', 'EVO---grand')).toBe(true)
    expect(matchesProductSearch('VinFast Amio S2', 'amio s 2')).toBe(true)
    expect(matchesProductSearch('VinFast Amio S2', 'amio s3')).toBe(false)
  })
})
