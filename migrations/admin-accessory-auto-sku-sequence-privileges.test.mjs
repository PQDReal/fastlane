import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('./033_admin_accessory_auto_sku_sequence_privileges.sql', import.meta.url), 'utf8')
const lockdownMigration = readFileSync(new URL('./034_admin_accessory_auto_sku_sequence_lockdown.sql', import.meta.url), 'utf8')

describe('admin accessory SKU sequence privileges', () => {
  it('keeps sequence allocation private to the server role', () => {
    expect(migration).toContain('revoke all on sequence public.accessory_sku_sequence from public, anon, authenticated')
    expect(migration).toContain('grant usage, select on sequence public.accessory_sku_sequence to service_role')
    expect(lockdownMigration).toContain('revoke all on sequence public.accessory_sku_sequence from public, anon, authenticated, service_role')
    expect(lockdownMigration).toContain('grant usage, select on sequence public.accessory_sku_sequence to service_role')
  })
})
