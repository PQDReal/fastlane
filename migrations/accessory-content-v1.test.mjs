import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations/014_accessory_content_v1.sql'),
  'utf8',
)
const activeSql = migration.split('-- Rollback procedure')[0]

describe('accessory content v1 migration', () => {
  it('is transactional and embeds the complete reviewed payload', () => {
    expect(migration.trimStart()).toMatch(/^begin;/)
    expect(activeSql.trimEnd()).toMatch(/commit;$/)
    expect(migration).toContain('Approved aggregate SHA-256: 88AEAF8623A6B6EE395439BCC103172B99D8795B9C511128363A425B2ABFFB3F')
    expect(migration.match(/^  \('[^']+', '[^']+', \$sections\$/gm)).toHaveLength(83)
    expect(migration).toContain('(select count(*) from accessory_content_v1_payload) <> 83')
  })

  it('defines and enforces the strict accessory_content_v1 shape', () => {
    expect(migration).toContain('function app_private.is_accessory_content_v1(document jsonb)')
    expect(migration).toContain("array['schema', 'sections']")
    expect(migration).toContain("array['key', 'type', 'title', 'display_order', 'body', 'items', 'attributes']")
    expect(migration).toContain("'TECHNICAL_SPECS', 'FEATURES', 'USAGE_GUIDE', 'CARE_GUIDE'")
    expect(migration).toContain("(section ->> 'display_order')::integer <> section_index * 10")
    expect(migration).toContain('add constraint products_accessory_content_v1_check')
    expect(migration).toContain('validate constraint products_accessory_content_v1_check')
  })

  it('preflights the audited catalog and normalized service labels', () => {
    expect(migration).toContain('(select count(*) from public.products) <> 110')
    expect(migration).toContain("where product_type = 'ACCESSORY'")
    expect(migration).toContain('Expected 83 exact legacy PID/SKU matches')
    expect(migration).toContain('assignment_count <> 32')
    expect(migration).toContain("label.code = 'installation') <> 7")
    expect(migration).toContain("label.code = 'showroom_pickup') <> 25")
  })

  it('updates only accessory specifications and removes legacy top-level keys', () => {
    const updateBlock = activeSql.match(/update public\.products product[\s\S]*?get diagnostics updated_count = row_count;/)?.[0] ?? ''
    expect(updateBlock).toContain("where product.product_type = 'ACCESSORY'")
    expect(updateBlock).toContain("set specifications = jsonb_build_object(")
    expect(updateBlock).not.toMatch(/set\s+description\s*=/i)
    expect(migration).toContain("specifications ?| array[")
    expect(migration).toContain("'service_labels', 'images', 'variants', 'price', 'formatted_price'")
    expect(activeSql).not.toContain('vehicle_variants')
    expect(activeSql).not.toContain('product_content_documents')
  })

  it('guards all neighboring catalog data and documents backup-dependent rollback', () => {
    expect(migration).toContain('as non_accessory_spec_checksum')
    expect(migration).toContain('as accessory_description_checksum')
    expect(migration).toContain('guard.variant_count <> (select count(*) from public.product_variants)')
    expect(migration).toContain('guard.media_count <> (select count(*) from public.product_media)')
    expect(migration).toContain('guard.inventory_count <> (select count(*) from public.inventory_items)')
    expect(migration).toContain('requires the exact pre-deployment backup captured before apply')
    expect(migration).toContain('Never apply without first exporting all 83 legacy')
  })
})
