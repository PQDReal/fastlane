import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '007_catalog_read_permissions.sql'),
  'utf8',
)
const activeSql = migration.slice(0, migration.indexOf('-- Rollback guidance'))
const catalogTables = [
  'product_option_groups',
  'product_option_values',
  'product_variant_option_values',
  'product_media',
]

describe('normalized catalog table permissions', () => {
  it('resets anon/authenticated to SELECT only on exactly four catalog tables', () => {
    expect(activeSql).toMatch(
      /revoke all privileges on table[\s\S]*?from anon, authenticated;/i,
    )
    expect(activeSql).toMatch(
      /grant select on table[\s\S]*?to anon, authenticated;/i,
    )
    expect(activeSql).not.toMatch(
      /grant\s+(?:all|insert|update|delete|truncate|references|trigger)[\s\S]*?to anon, authenticated;/i,
    )

    const publicTables = [...activeSql.matchAll(/public\.([a-z_]+)/g)]
      .map(([, table]) => table)
    expect(new Set(publicTables)).toEqual(new Set(catalogTables))
  })

  it('preserves service-role access required by the catalog importer', () => {
    expect(activeSql).toMatch(
      /grant all privileges on table[\s\S]*?to service_role;/i,
    )
    for (const table of catalogTables) {
      expect(activeSql).toContain(`public.${table}`)
    }
  })

  it('makes restoration of dangerous public-role grants explicit', () => {
    const rollback = migration.slice(migration.indexOf('-- Rollback guidance'))

    expect(rollback).toMatch(/Row-level security[\s\S]*?does not protect TRUNCATE/)
    expect(rollback).toMatch(
      /grant insert, update, delete, truncate, references, trigger on table[\s\S]*?to anon, authenticated;/i,
    )
  })
})
