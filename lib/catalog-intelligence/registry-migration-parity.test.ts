import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { CORE_SPEC_ALIASES, CORE_SPEC_DEFINITIONS } from './definitions'
import { CORE_VEHICLE_SPEC_KEYS } from './types'

const migration = readFileSync(new URL('../../migrations/064_catalog_intelligence_core.sql', import.meta.url), 'utf8')

describe('catalog intelligence registry parity', () => {
  it('keeps the legacy canonical key contract in one shared type source', () => {
    expect(CORE_SPEC_DEFINITIONS.map((item) => item.canonicalKey).sort()).toEqual([...CORE_VEHICLE_SPEC_KEYS].sort())
  })

  it('seeds every deterministic code definition and alias in the database migration', () => {
    for (const definition of CORE_SPEC_DEFINITIONS) expect(migration).toContain(`'${definition.canonicalKey}'`)
    for (const alias of CORE_SPEC_ALIASES) {
      expect(migration).toContain(`('${alias.definitionKey}', '${alias.alias}'`)
    }
  })
})
