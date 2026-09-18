import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}))

import { getKnowledgeSourceByChunkId } from './source-reader'

function queryResult(data: unknown, error: unknown = null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  return query
}

describe('knowledge source reader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not query the database for a malformed chunk identifier', async () => {
    expect(await getKnowledgeSourceByChunkId('../draft')).toBeNull()
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled()
  })

  it('returns the exact active and published RAG chunk', async () => {
    const chunkId = '951985cc-7f87-4d8e-97ce-f6ecda1a15c0'
    const documentId = '5d2af041-e177-4039-8089-933b864bbab3'
    const versionId = 'b874dd8a-622a-4a3b-8853-ad7d42951214'
    const queries = {
      sales_agent_knowledge_chunks: queryResult({
        id: chunkId,
        document_id: documentId,
        version_id: versionId,
        section_title: 'Sạc pin cao áp',
        section_anchor: 'sac_pin_cao_ap',
        hierarchy_path: '2/4',
        source_node_id: 'node-24',
        content: 'Các bước sạc pin an toàn.',
      }),
      sales_agent_knowledge_documents: queryResult({
        id: documentId,
        document_key: 'vinfast:vf-5:2024:vi-VN',
        title: 'Sổ tay hướng dẫn sử dụng VinFast VF 5 (2024)',
        category: 'TECHNICAL_GUIDE',
        vehicle_model: 'VF 5',
        model_year: 2024,
        locale: 'vi-VN',
        lifecycle_status: 'ACTIVE',
        active_version_id: versionId,
        deleted_at: null,
      }),
      sales_agent_knowledge_versions: queryResult({
        id: versionId,
        document_id: documentId,
        version_no: 1,
        publication_status: 'PUBLISHED',
        index_status: 'READY',
        effective_from: '2024-01-01T00:00:00.000Z',
        effective_to: null,
      }),
    }
    mocks.getSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: keyof typeof queries) => queries[table]),
    })

    const source = await getKnowledgeSourceByChunkId(chunkId)

    expect(source).toMatchObject({
      chunkId,
      vehicleModel: 'VF 5',
      modelYear: 2024,
      sectionTitle: 'Sạc pin cao áp',
      content: 'Các bước sạc pin an toàn.',
    })
    expect(source?.citationId).toContain('cite:vinfast:vf-5:2024:vi-VN:v1:sac_pin_cao_ap')
  })

  it('hides a chunk whose version is no longer the active document version', async () => {
    const chunkId = '951985cc-7f87-4d8e-97ce-f6ecda1a15c0'
    const documentId = '5d2af041-e177-4039-8089-933b864bbab3'
    const versionId = 'b874dd8a-622a-4a3b-8853-ad7d42951214'
    const queries = {
      sales_agent_knowledge_chunks: queryResult({
        id: chunkId,
        document_id: documentId,
        version_id: versionId,
        section_title: 'Sạc pin',
        section_anchor: 'sac_pin',
        hierarchy_path: '2/4',
        content: 'Old content',
      }),
      sales_agent_knowledge_documents: queryResult({
        id: documentId,
        lifecycle_status: 'ACTIVE',
        active_version_id: '72c07fd2-aa8e-4f07-b1a8-a0e4b1cf2f5a',
        deleted_at: null,
      }),
      sales_agent_knowledge_versions: queryResult({
        id: versionId,
        document_id: documentId,
        version_no: 1,
        publication_status: 'PUBLISHED',
        index_status: 'READY',
        effective_from: '2024-01-01T00:00:00.000Z',
        effective_to: null,
      }),
    }
    mocks.getSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: keyof typeof queries) => queries[table]),
    })

    expect(await getKnowledgeSourceByChunkId(chunkId)).toBeNull()
  })
})
