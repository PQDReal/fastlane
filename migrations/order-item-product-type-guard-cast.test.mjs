import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    'migrations',
    '029_order_item_product_type_guard_cast.sql',
  ),
  'utf8',
)

const activeMigration = migration.split('-- Rollback')[0]

describe('order item product type guard cast migration', () => {
  it('patches the existing snapshot guard without replacing its behavior', () => {
    expect(activeMigration).toContain("namespace.nspname = 'app_private'")
    expect(activeMigration).toContain(
      "procedure.proname = 'guard_order_item_snapshot'",
    )
    expect(activeMigration).toContain('pg_get_functiondef(guard_oid)')
    expect(activeMigration).toContain(
      "'p.product_type = new.product_type_snapshot::text'",
    )
  })

  it('fails if the expected guard comparison is missing', () => {
    expect(activeMigration).toContain(
      'guard_order_item_snapshot definition does not contain the expected product type comparison',
    )
  })

  it('does not weaken either product type column', () => {
    expect(activeMigration).not.toMatch(/alter\s+table/i)
    expect(activeMigration).not.toMatch(/create\s+cast/i)
  })
})
