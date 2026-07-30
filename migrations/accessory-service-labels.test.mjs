import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations/013_accessory_service_labels.sql'),
  'utf8',
)

describe('accessory service-label migration', () => {
  it('is transactional and preflights the audited legacy dataset', () => {
    expect(migration.trimStart()).toMatch(/^begin;/)
    expect(migration.trimEnd()).toMatch(/commit;[\s\S]*rollback guidance[\s\S]*commit;$/i)
    expect(migration).toContain("v_accessory_count <> 83")
    expect(migration).toContain("v_label_element_count <> 32")
    expect(migration).toContain("v_unique_pair_count <> 32")
    expect(migration).toContain("not in ('Có lắp đặt', 'Nhận tại showroom')")
  })

  it('creates normalized labels and assignments with required integrity', () => {
    expect(migration).toContain('create table public.catalog_service_labels')
    expect(migration).toContain('create table public.product_service_label_assignments')
    expect(migration).toContain("check (code ~ '^[a-z][a-z0-9_]*$')")
    expect(migration).toContain('check (char_length(code) <= 80)')
    expect(migration).toContain('check (char_length(name) <= 160)')
    expect(migration).toContain('lower(normalize(btrim(name), NFC))')
    expect(migration).toContain('primary key (product_id, service_label_id)')
    expect(migration).toContain('references public.products(id) on delete cascade')
    expect(migration).toContain('references public.catalog_service_labels(id) on delete restrict')
    expect(migration).toContain('(service_label_id, product_id)')
  })

  it('guards the ACCESSORY-only invariant in both directions', () => {
    expect(migration).toContain('guard_accessory_service_label_assignment')
    expect(migration).toContain("v_product_type is distinct from 'ACCESSORY'")
    expect(migration).toContain('guard_product_service_label_type_change')
    expect(migration).toContain('before update of product_type')
  })

  it('keeps public roles read-only behind active label and product RLS', () => {
    expect(migration).toContain('alter table public.catalog_service_labels enable row level security')
    expect(migration).toContain('alter table public.product_service_label_assignments enable row level security')
    expect(migration).toMatch(/revoke all privileges on table[\s\S]*from public, anon, authenticated/)
    expect(migration).toMatch(/grant select on table[\s\S]*to anon, authenticated/)
    expect(migration).toMatch(/grant all privileges on table[\s\S]*to service_role/)
    expect(migration).toContain("product.product_type = 'ACCESSORY'")
  })

  it('seeds exact reviewed labels and verifies the backfill', () => {
    expect(migration).toContain("('installation', 'Có lắp đặt', 10)")
    expect(migration).toContain("('showroom_pickup', 'Nhận tại showroom', 20)")
    expect(migration).toContain('v_installation_count <> 7')
    expect(migration).toContain('v_showroom_pickup_count <> 25')
    expect(migration).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)
  })

  it('provides one atomic service-role-only assignment replacement function', () => {
    expect(migration).toContain('function public.replace_product_service_labels(')
    expect(migration).toContain('select distinct unnest(v_requested_ids) as id')
    expect(migration).toMatch(/where product\.id = target_product_id\s+for update/)
    expect(migration).toContain('for key share')
    expect(migration).toContain('cardinality(v_requested_ids) > 100')
    expect(migration).toContain('Every assigned service label must exist and be active.')
    expect(migration).toMatch(/revoke all on function public\.replace_product_service_labels[\s\S]*from public, anon, authenticated/)
    expect(migration).toMatch(/grant execute on function public\.replace_product_service_labels[\s\S]*to service_role/)
  })
})
