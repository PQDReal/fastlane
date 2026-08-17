import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations/011_catalog_collections.sql'),
  'utf8',
)

describe('catalog taxonomy schema migration', () => {
  it('creates source-stable collections, vehicle models, and memberships', () => {
    expect(migration).toContain('create table public.vehicle_models')
    expect(migration).toContain('create table public.catalog_collections')
    expect(migration).toContain('create table public.product_collection_memberships')
    expect(migration).toContain('unique (source_system, source_key)')
    expect(migration).toContain('unique (product_id, collection_id, source_system)')
    expect(migration).toContain('first_seen_at timestamptz not null')
    expect(migration).toContain('last_seen_at timestamptz not null')
  })

  it('enforces hierarchy, root integrity, primary membership, and lookup indexes', () => {
    expect(migration).toContain('catalog_collections_parent_same_root_fk')
    expect(migration).toContain('guard_catalog_collection_hierarchy')
    expect(migration).toContain('hierarchy cannot contain a cycle')
    expect(migration).toContain('product_collection_memberships_product_root_fk')
    expect(migration).toContain('product_collection_memberships_one_primary_per_scope_uidx')
    expect(migration).toContain('product_collection_memberships_product_active_idx')
    expect(migration).toContain('product_collection_memberships_collection_active_idx')
  })

  it('keeps public roles read-only behind active-row RLS policies', () => {
    for (const table of [
      'vehicle_models',
      'catalog_collections',
      'product_collection_memberships',
    ]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`)
    }
    expect(migration).toMatch(/revoke all privileges on table[\s\S]*from public, anon, authenticated/)
    expect(migration).toMatch(/grant select on table[\s\S]*to anon, authenticated/)
    expect(migration).toMatch(/grant all privileges on table[\s\S]*to service_role/)
  })

  it('does not seed environment-specific UUID values', () => {
    expect(migration).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)
  })
})
