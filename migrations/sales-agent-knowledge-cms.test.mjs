import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('Migration 058: Sales Agent Knowledge CMS', () => {
  const sql = readFileSync(join(process.cwd(), 'migrations/058_sales_agent_knowledge_cms.sql'), 'utf8')

  it('creates sales_agent_knowledge_documents and sales_agent_knowledge_chunks tables', () => {
    expect(sql).toContain('create table if not exists public.sales_agent_knowledge_documents')
    expect(sql).toContain('create table if not exists public.sales_agent_knowledge_chunks')
    expect(sql).toContain('references public.sales_agent_knowledge_documents(id) on delete cascade')
  })

  it('enforces check constraints and RLS security', () => {
    expect(sql).toContain('sales_agent_knowledge_documents_category_check')
    expect(sql).toContain('sales_agent_knowledge_documents_status_check')
    expect(sql).toContain('alter table public.sales_agent_knowledge_documents enable row level security')
    expect(sql).toContain('alter table public.sales_agent_knowledge_chunks enable row level security')
  })

  it('seeds official VinFast knowledge documents and chunks', () => {
    expect(sql).toContain('chinh-sach-bao-hanh-xe-dien-vinfast')
    expect(sql).toContain('chinh-sach-thue-pin-va-he-thong-tram-sac')
    expect(sql).toContain('quy-trinh-dat-coc-va-nhan-xe-fastlane')
    expect(sql).toContain('chinh-sach-tra-gop-va-uu-dai-tai-chinh')
  })
})
