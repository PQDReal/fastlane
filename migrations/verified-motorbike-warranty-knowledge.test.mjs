import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('Migration 066: verified motorbike warranty knowledge', () => {
  const sql = readFileSync(
    join(process.cwd(), 'migrations/066_verified_motorbike_warranty_knowledge.sql'),
    'utf8',
  )

  it('archives the unverified mixed-vehicle document and its chunks', () => {
    expect(sql).toContain("where id = '00000000-0000-4000-8000-000000000001'")
    expect(sql).toContain("set is_active = false")
    expect(sql).toContain("status = 'ARCHIVED'")
  })

  it('publishes contextual motorbike warranty facts and official sources', () => {
    expect(sql).toContain('chinh-sach-bao-hanh-pin-xe-may-dien-vinfast')
    expect(sql).toContain('alter column document_key')
    expect(sql).toContain("set document_key = 'chinh-sach-bao-hanh-pin-xe-may-dien-vinfast'")
    expect(sql).toContain('drop default')
    expect(sql).toContain('trước 15/08/2025')
    expect(sql).toContain('hóa đơn đúng ngày 15/08/2025')
    expect(sql).toContain('sbh-xmd-lfp-5-nam.pdf')
    expect(sql).toContain('sbh-xmd-lfp-6-nam-tu-15-8-2025_0.pdf')
    expect(sql).toContain('250528-xmd-pin-khac.pdf')
  })

  it('uses an existing public route and does not claim PDF ingestion', () => {
    expect(sql).toContain('/after-sales?vehicle=motorbike&tab=warranty#warranty-term')
    expect(sql).not.toContain('/knowledge/')
    expect(sql).toContain('chưa được ingest')
  })

  it('supports both legacy and versioned knowledge chunk schemas', () => {
    expect(sql).toContain("to_regclass('public.sales_agent_knowledge_versions')")
    expect(sql).toContain('sales_agent_knowledge_index_generations')
    expect(sql).toContain('version_id')
    expect(sql).toContain('index_generation_id')
    expect(sql).toContain('hierarchy_path')
    expect(sql).toContain('section_anchor')
    expect(sql).toContain('content_hash')
    expect(sql).toContain('token_count')
    expect(sql).toMatch(/else\s+insert into public\.sales_agent_knowledge_chunks/i)
  })
})
