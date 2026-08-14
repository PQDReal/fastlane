import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations/012_catalog_collection_fk_indexes.sql'),
  'utf8',
)

describe('catalog taxonomy composite FK indexes', () => {
  it('covers both membership foreign keys in referenced-column order', () => {
    expect(migration).toContain(
      'on public.product_collection_memberships (root_category_id, product_id)',
    )
    expect(migration).toContain(
      'on public.product_collection_memberships (root_category_id, collection_id)',
    )
  })

  it('keeps rollback guidance for both additive indexes', () => {
    expect(migration).toContain(
      'drop index if exists public.product_collection_memberships_root_collection_idx',
    )
    expect(migration).toContain(
      'drop index if exists public.product_collection_memberships_root_product_idx',
    )
  })
})
