import { describe, expect, it } from 'vitest'

import { toNamePrefixTsQuery } from '@/lib/catalog/search'

describe('name-only prefix search query', () => {
  it('unaccents Vietnamese text consistently with the database vector', () => {
    expect(toNamePrefixTsQuery('Điện thoại')).toBe('dien:* & thoai:*')
  })

  it('removes tsquery operators and rejects empty input', () => {
    expect(toNamePrefixTsQuery("VF 3' | !:*" )).toBe('vf:* & 3:*')
    expect(toNamePrefixTsQuery('---')).toBeNull()
  })
})
