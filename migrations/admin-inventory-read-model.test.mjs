import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations/057_admin_inventory_read_model.sql'),
  'utf8',
).replace(/\r\n?/g, '\n')

describe('admin inventory read model migration', () => {
  it('defines one immutable normalizer and maintains normalized search text on writes', () => {
    expect(migration.trimStart()).toMatch(/^begin;/)
    expect(migration).toContain('create or replace function public.fastlane_normalize_inventory_search(value text)')
    expect(migration).toContain('immutable')
    expect(migration).toContain('public.fastlane_normalize_product_search(value)')
    expect(migration).toContain('add column if not exists inventory_search_text text not null default')
    expect(migration).toContain('products_inventory_search_text_update')
    expect(migration).toContain('product_variants_inventory_search_text_update')
    expect(migration).toContain('vehicle_variants_inventory_search_text_update')
    expect(migration).toContain('update public.products')
    expect(migration).toContain('update public.product_variants')
    expect(migration).toContain('update public.vehicle_variants')
  })

  it('adds trigram search and join/filter indexes', () => {
    expect(migration).toContain('create extension if not exists pg_trgm')
    expect(migration).toContain('using gin (inventory_search_text %s)')
    expect(migration).toContain('admin_inventory_products_type_active_idx')
    expect(migration).toContain('admin_inventory_product_variants_product_active_idx')
    expect(migration).toContain('admin_inventory_vehicle_product_active_idx')
    expect(migration).toContain('admin_inventory_vehicle_product_variant_uidx')
  })

  it('creates a shared service-role-only view with inventory and vehicle status semantics', () => {
    expect(migration).toMatch(/create or replace view public\.admin_inventory_base/i)
    expect(migration).toContain('security_invoker = true')
    expect(migration).toContain('left join public.inventory_items inventory')
    expect(migration).toContain('left join public.vehicle_variants vehicle')
    expect(migration).toContain("then 'MISSING_INVENTORY'")
    expect(migration).toContain("then 'OUT_OF_STOCK'")
    expect(migration).toContain("then 'LOW_STOCK'")
    expect(migration).toContain("then 'UNLINKED'")
    expect(migration).toContain('public.fastlane_normalize_inventory_search(')
    expect(migration).toContain('revoke all on public.admin_inventory_base from public, anon, authenticated')
    expect(migration).toContain('grant select on public.admin_inventory_base to service_role')
  })

  it('preserves the original view column order when adding search columns', () => {
    const viewStart = migration.indexOf('create or replace view public.admin_inventory_base')
    const viewEnd = migration.indexOf('comment on view public.admin_inventory_base', viewStart)
    const viewDefinition = migration.slice(viewStart, viewEnd)

    expect(viewStart).toBeGreaterThanOrEqual(0)
    expect(viewEnd).toBeGreaterThan(viewStart)
    expect(viewDefinition.indexOf(') as search_document')).toBeLessThan(
      viewDefinition.indexOf('product.inventory_search_text as product_search_text'),
    )
    expect(viewDefinition.indexOf('product.inventory_search_text as product_search_text')).toBeLessThan(
      viewDefinition.indexOf('variant.inventory_search_text as variant_search_text'),
    )
    expect(viewDefinition.indexOf('variant.inventory_search_text as variant_search_text')).toBeLessThan(
      viewDefinition.indexOf('vehicle.inventory_search_text as vehicle_search_text'),
    )
  })

  it('defines the inventory RPCs and product-summary RPC with strict privileges', () => {
    expect(migration).toMatch(/create or replace function public\.list_admin_inventory\(/i)
    expect(migration).toMatch(/create or replace function public\.get_admin_inventory_filter_options\(/i)
    expect(migration).toMatch(/create or replace function public\.get_admin_product_inventory_summary\(/i)
    expect(migration).toContain("convert_from(decode(btrim(p_cursor), 'base64'), 'UTF8')::jsonb")
    expect(migration).toContain("v_cursor_variant_id := (v_cursor ->> 'variantId')::uuid")
    expect(migration).toContain('limit v_limit + 1')
    expect(migration).toContain("'nextCursor'")
    expect(migration).toContain("'hasMore'")
    expect(migration).toContain("'statusCounts'")
    expect(migration).toContain('revoke all on function public.list_admin_inventory')
    expect(migration).toContain('grant execute on function public.list_admin_inventory')
    expect(migration).toContain('revoke all on function public.get_admin_inventory_filter_options')
    expect(migration).toContain('grant execute on function public.get_admin_inventory_filter_options')
    expect(migration).toContain('revoke all on function public.get_admin_product_inventory_summary')
    expect(migration).toContain('grant execute on function public.get_admin_product_inventory_summary')
    expect(migration).toContain("'inventoryVariantCount'")
    expect(migration).toContain("'inventoryQuantity'")
  })

  it('keeps normalize and status rules inside the database contract', () => {
    expect(migration).toContain("v_search text := public.fastlane_normalize_inventory_search")
    expect(migration).toContain("inventory.product_search_text like '%' || v_search || '%'")
    expect(migration).toContain("inventory.variant_search_text like '%' || v_search || '%'")
    expect(migration).toContain("inventory.vehicle_search_text like '%' || v_search || '%'")
    for (const status of ['INACTIVE', 'UNLINKED', 'MISSING_INVENTORY', 'OUT_OF_STOCK', 'LOW_STOCK', 'IN_STOCK']) {
      expect(migration).toContain(`'${status}'`)
    }
    expect(migration).toContain("inventory.inventory_status = v_status")
  })
})
