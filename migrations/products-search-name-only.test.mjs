import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations/015_products_search_name_only.sql'),
  'utf8',
)

describe('products name-only search migration', () => {
  it('preflights and keeps the existing GIN index', () => {
    expect(migration.trimStart()).toMatch(/^begin;/)
    expect(migration).toContain('v_product_count <> 110')
    expect(migration).toContain("index_definition.indexname = 'products_search_gin'")
    expect(migration).not.toContain('drop index products_search_gin')
  })

  it('indexes only the unaccented product name using simple config', () => {
    const activeSql = migration.split('-- Rollback procedure')[0]
    expect(activeSql).toContain("to_tsvector(\n    'simple',\n    extensions.unaccent(coalesce(new.name, ''))")
    expect(activeSql.match(/extensions\.unaccent/g)).toHaveLength(3)
    expect(activeSql).not.toContain('new.description')
    expect(activeSql).not.toContain('new.specifications')
    expect(activeSql).not.toContain('sku')
  })

  it('narrows trigger events and verifies every vector', () => {
    expect(migration).toMatch(/create trigger products_search_vector_write\s+before insert or update of name\s+on public\.products/i)
    expect(migration).toContain('v_invalid_vector_count <> 0')
    expect(migration).toContain("v_trigger_definition not ilike '%before insert or update of name on products%'")
  })

  it('documents the exact audited rollback function and trigger', () => {
    expect(migration).toContain('coalesce(new.description')
    expect(migration).toContain('new.specifications::text')
    expect(migration).toContain('before insert or update of name, description, specifications')
  })
})
