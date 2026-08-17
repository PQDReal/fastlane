import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('./053_admin_accessory_drafts.sql', import.meta.url), 'utf8')

describe('admin accessory drafts migration', () => {
  it('keeps incomplete authoring separate from canonical products', () => {
    expect(sql).toContain('create table if not exists public.admin_accessory_drafts')
    expect(sql).toContain('payload jsonb not null')
    expect(sql).toContain('product_id uuid')
    expect(sql).toContain("status text not null default 'DRAFT'")
  })

  it('supports private ownership, optimistic revisions, and cleanup', () => {
    expect(sql).toContain('owner_user_id uuid not null')
    expect(sql).toContain('admin_accessory_drafts_owner_client_key_idx')
    expect(sql).toContain('admin_accessory_drafts_owner_product_draft_idx')
    expect(sql).toContain('revision bigint not null default 1')
    expect(sql).toContain('alter table public.admin_accessory_drafts enable row level security')
    expect(sql).toContain('grant select, insert, update, delete on table public.admin_accessory_drafts to service_role')
  })
})
