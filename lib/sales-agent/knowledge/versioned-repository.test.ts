import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  VersionedKnowledgeRepository,
  computeContentChecksum,
  type CreateDocumentDraftInput,
} from './versioned-repository'

describe('VersionedKnowledgeRepository (A19-KR-106)', () => {
  let mockClient: any
  let repo: VersionedKnowledgeRepository

  beforeEach(() => {
    mockClient = {
      from: vi.fn(),
      rpc: vi.fn(),
    }
    repo = new VersionedKnowledgeRepository(mockClient)
  })

  it('computes sha256 checksum correctly and deterministically', () => {
    const text = 'Chính sách bảo hành VinFast 10 năm'
    const hash1 = computeContentChecksum(text)
    const hash2 = computeContentChecksum('  ' + text + '  ')
    expect(hash1).toBe(hash2)
    expect(hash1.length).toBe(64)
  })

  it('creates initial document and draft version with audit event', async () => {
    const input: CreateDocumentDraftInput = {
      documentKey: 'vinfast:VF8:2025:vi-VN',
      category: 'TECHNICAL_GUIDE',
      title: 'Sổ tay hướng dẫn sử dụng VinFast VF 8 2025',
      slug: 'so-tay-vinfast-vf8-2025',
      contentMarkdown: '# VF 8 2025 Manual\n\nNội dung chi tiết...',
      authorId: '00000000-0000-0000-0000-000000000001',
    }

    const mockDoc = {
      id: 'doc-123',
      document_key: input.documentKey,
      locale: 'vi-VN',
      category: input.category,
      title: input.title,
      slug: input.slug,
      active_version_id: null,
      lifecycle_status: 'ACTIVE',
      deleted_at: null,
      created_at: '2026-08-18T00:00:00.000Z',
      updated_at: '2026-08-18T00:00:00.000Z',
    }

    const mockVer = {
      id: 'ver-123',
      document_id: 'doc-123',
      version_no: 1,
      content_markdown: input.contentMarkdown,
      content_checksum: computeContentChecksum(input.contentMarkdown),
      summary: null,
      publication_status: 'DRAFT',
      index_status: 'PENDING',
      author_id: input.authorId,
      reviewer_id: null,
      effective_from: '2026-08-18T00:00:00.000Z',
      effective_to: null,
      created_at: '2026-08-18T00:00:00.000Z',
    }

    mockClient.from.mockImplementation((tableName: string) => {
      if (tableName === 'sales_agent_knowledge_documents') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockDoc, error: null }),
            }),
          }),
        }
      }
      if (tableName === 'sales_agent_knowledge_versions') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockVer, error: null }),
            }),
          }),
        }
      }
      if (tableName === 'sales_agent_knowledge_publication_events') {
        return {
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
      }
      return {}
    })

    const res = await repo.createDocumentDraft(input)
    expect(res.document.id).toBe('doc-123')
    expect(res.document.activeVersionId).toBeNull()
    expect(res.version.versionNo).toBe(1)
    expect(res.version.publicationStatus).toBe('DRAFT')
  })

  it('delegates atomic activation to sales_agent_activate_version RPC and fails closed on null', async () => {
    mockClient.rpc.mockResolvedValue({
      data: { success: true, epoch: 2 },
      error: null,
    })

    const res = await repo.activateVersion('doc-123', 'ver-123', 'actor-123', 'Release v1.0')
    expect(mockClient.rpc).toHaveBeenCalledWith('sales_agent_activate_version', {
      p_document_id: 'doc-123',
      p_version_id: 'ver-123',
      p_actor_id: 'actor-123',
      p_reason: 'Release v1.0',
    })
    expect(res.success).toBe(true)
    expect(res.epoch).toBe(2)

    // Fail-closed test
    mockClient.rpc.mockResolvedValue({ data: null, error: null })
    await expect(repo.activateVersion('doc-123', 'ver-123')).rejects.toThrow(/Failed to activate version via RPC/)
  })

  it('delegates atomic rollback to sales_agent_rollback_version RPC and fails closed on error', async () => {
    mockClient.rpc.mockResolvedValue({
      data: { success: true, epoch: 3 },
      error: null,
    })

    const res = await repo.rollbackVersion('doc-123', 'ver-100', 'actor-123', 'Emergency Rollback')
    expect(mockClient.rpc).toHaveBeenCalledWith('sales_agent_rollback_version', {
      p_document_id: 'doc-123',
      p_target_version_id: 'ver-100',
      p_actor_id: 'actor-123',
      p_reason: 'Emergency Rollback',
    })
    expect(res.epoch).toBe(3)

    mockClient.rpc.mockResolvedValue({ data: null, error: { message: 'Version not ready' } })
    await expect(repo.rollbackVersion('doc-123', 'ver-100')).rejects.toThrow(/Version not ready/)
  })

  it('delegates archive, soft delete, restore and enqueue index job to RPCs', async () => {
    mockClient.rpc.mockResolvedValueOnce({ data: { success: true, epoch: 4 }, error: null })
    const archRes = await repo.archiveDocument('doc-123', 'actor-123', 'EOL policy')
    expect(archRes.epoch).toBe(4)

    mockClient.rpc.mockResolvedValueOnce({ data: { success: true, epoch: 5 }, error: null })
    const delRes = await repo.softDeleteDocument('doc-123', 'actor-123', 'Admin delete')
    expect(delRes.epoch).toBe(5)

    mockClient.rpc.mockResolvedValueOnce({ data: { success: true, epoch: 6 }, error: null })
    const restRes = await repo.restoreDocument('doc-123', 'ver-123', 'actor-123', 'Restore')
    expect(restRes.epoch).toBe(6)

    mockClient.rpc.mockResolvedValueOnce({ data: '00000000-0000-4000-8000-000000000123', error: null })
    const jobId = await repo.enqueueIndexJob('ver-123')
    expect(jobId).toBe('00000000-0000-4000-8000-000000000123')
  })
})
