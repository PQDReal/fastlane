import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '027_orders_shipping_address_contract.sql'),
  'utf8',
)

const activeMigration = migration.split('-- Rollback')[0]

describe('orders shipping address contract migration', () => {
  it('replaces the legacy constraint with the public API field names', () => {
    expect(activeMigration).toContain('drop constraint if exists orders_shipping_address_required_fields')
    expect(activeMigration).toContain('add constraint orders_shipping_address_required_fields')
    expect(activeMigration).toContain("shipping_address ->> 'recipientName'")
    expect(activeMigration).toContain("shipping_address ->> 'phoneNumber'")
    expect(activeMigration).toContain("shipping_address ->> 'line1'")
    expect(activeMigration).not.toContain("shipping_address ->> 'recipientPhone'")
    expect(activeMigration).not.toContain("shipping_address ->> 'addressLine1'")
  })

  it('validates the nested location objects used by order reads', () => {
    expect(activeMigration).toContain("jsonb_typeof(shipping_address -> 'communeLevel') = 'object'")
    expect(activeMigration).toContain("shipping_address #>> '{communeLevel,name}'")
    expect(activeMigration).toContain("shipping_address #>> '{communeLevel,type}' in ('COMMUNE', 'WARD', 'SPECIAL_ZONE')")
    expect(activeMigration).toContain("jsonb_typeof(shipping_address -> 'province') = 'object'")
    expect(activeMigration).toContain("shipping_address #>> '{province,name}'")
    expect(activeMigration).toContain("shipping_address ->> 'countryCode' = 'VN'")
  })

  it('keeps phone normalization and maximum lengths enforced at the database boundary', () => {
    expect(activeMigration).toContain("~ '^\\+?[0-9]{9,15}$'")
    expect(activeMigration).toContain("char_length(shipping_address ->> 'recipientName') <= 120")
    expect(activeMigration).toContain("char_length(shipping_address ->> 'line1') <= 255")
  })
})
