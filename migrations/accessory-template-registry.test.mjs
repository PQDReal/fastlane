import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('./052_accessory_template_registry.sql', import.meta.url), 'utf8')

describe('accessory template registry migration', () => {
  it('creates immutable template revisions and product provenance', () => {
    expect(sql).toContain('create table if not exists public.accessory_templates')
    expect(sql).toContain('create table if not exists public.accessory_template_versions')
    expect(sql).toContain('accessory_template_version_id uuid')
    expect(sql).toContain('on delete restrict')
    expect(sql).toContain('save_admin_accessory_product_v4')
    expect(sql).toContain("target_payload - 'templateVersionId'")
  })

  it('seeds every current non-custom template and backfills legacy codes', () => {
    for (const code of ['vehicle-fit', 'window-film', 'apparel', 'ev-charger']) expect(sql).toContain(`'${code}'`)
    for (const legacyCode of ['vehicle_fit', 'window_film', 'apparel', 'ev_charger']) expect(sql).toContain(`'${legacyCode}'`)
    expect(sql).toContain('p.accessory_template_version_id is null')
  })
})
