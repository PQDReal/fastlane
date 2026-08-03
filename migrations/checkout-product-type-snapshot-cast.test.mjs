import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    'migrations',
    '028_checkout_product_type_snapshot_cast.sql',
  ),
  'utf8',
)

const activeMigration = migration.split('-- Rollback')[0]

describe('checkout product type snapshot cast migration', () => {
  it('patches every checkout RPC definition at the database boundary', () => {
    expect(activeMigration).toContain("procedure.proname = 'checkout_accessory_cart'")
    expect(activeMigration).toContain('pg_get_functiondef(checkout_function.oid)')
    expect(activeMigration).toContain("'product.product_type::public.product_type,'")
    expect(activeMigration).toContain('patched_count <> 2')
  })

  it('fails instead of silently accepting an unexpected function definition', () => {
    expect(activeMigration).toContain(
      "strpos(function_definition, 'product.product_type,') = 0",
    )
    expect(activeMigration).toContain(
      'does not contain the expected product type snapshot expression',
    )
  })

  it('does not weaken the snapshot column or install an implicit cast', () => {
    expect(activeMigration).not.toMatch(/alter\s+table\s+public\.order_items/i)
    expect(activeMigration).not.toMatch(/create\s+cast/i)
  })
})
