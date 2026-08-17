import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migration = fs.readFileSync(
  path.join(root, 'migrations/010_catalog_variant_legacy_cleanup.sql'),
  'utf8',
)
const accessorySync = fs.readFileSync(
  path.join(root, 'scripts/sync-vinfast-accessories.mjs'),
  'utf8',
)
const publishedSync = fs.readFileSync(
  path.join(root, 'scripts/sync-published-catalog-options.mjs'),
  'utf8',
)

describe('catalog variant legacy cleanup', () => {
  it('fails closed on data or dependencies before dropping both columns', () => {
    expect(migration).toContain('lock table public.product_variants in access exclusive mode')
    expect(migration).toContain('where color is not null')
    expect(migration).toContain('where battery_option is not null')
    expect(migration).toContain('join pg_depend dependency')
    expect(migration).toMatch(/drop column color,\s*drop column battery_option/)
  })

  it('removes legacy database fields from both catalog writers and verifiers', () => {
    expect(accessorySync).not.toContain('battery_option')
    expect(accessorySync).not.toMatch(/select\([^)]*\bcolor\b/)

    const variantPayload = publishedSync.slice(
      publishedSync.indexOf('function variantPayload'),
      publishedSync.indexOf('async function backupCurrentData'),
    )
    expect(variantPayload).not.toContain('battery_option')
    expect(variantPayload).not.toMatch(/\n\s*color:/)
  })
})
