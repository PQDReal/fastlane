import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

// In-memory mock database state for testing
let mockDocuments: any[] = []
let mockChunks: any[] = []
let mockDbShouldFail = false

function createChainableQuery(initialData: any[] = []) {
  let currentData = [...initialData]
  let errorToReturn: any = mockDbShouldFail ? new Error('Database connection failed') : null

  const chain: any = {
    order: vi.fn().mockReturnThis(),
    eq: vi.fn().mockImplementation((field: string, val: any) => {
      currentData = currentData.filter((d) => d[field] === val)
      return chain
    }),
    or: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockImplementation(() => {
      if (errorToReturn) return Promise.resolve({ data: null, error: errorToReturn })
      return Promise.resolve({ data: currentData[0] || null, error: null })
    }),
    single: vi.fn().mockImplementation(() => {
      if (errorToReturn) return Promise.resolve({ data: null, error: errorToReturn })
      if (currentData.length === 0) {
        return Promise.resolve({ data: null, error: new Error('Row not found') })
      }
      return Promise.resolve({ data: currentData[0], error: null })
    }),
    then: vi.fn().mockImplementation((resolve) => {
      if (errorToReturn) return Promise.resolve(resolve({ data: null, count: null, error: errorToReturn }))
      return Promise.resolve(resolve({ data: currentData, count: currentData.length, error: null }))
    }),
  }

  return chain
}

vi.mock('@/lib/supabase-admin', () => {
  return {
    getSupabaseAdmin: () => ({
      from: (table: string) => {
        if (mockDbShouldFail) {
          const failChain: any = {
            select: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            range: vi.fn().mockReturnThis(),
            single: vi.fn().mockImplementation(() => Promise.resolve({ data: null, error: new Error('Database error') })),
            maybeSingle: vi.fn().mockImplementation(() => Promise.resolve({ data: null, error: new Error('Database error') })),
            insert: vi.fn().mockImplementation(() => ({
              select: vi.fn().mockImplementation(() => ({
                single: vi.fn().mockImplementation(() => Promise.resolve({ data: null, error: new Error('Database error') })),
              })),
              then: vi.fn().mockImplementation((resolve) => resolve({ data: null, error: new Error('Database error') })),
            })),
            update: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(() => ({
                select: vi.fn().mockImplementation(() => ({
                  single: vi.fn().mockImplementation(() => Promise.resolve({ data: null, error: new Error('Database error') })),
                })),
                then: vi.fn().mockImplementation((resolve) => resolve({ data: null, error: new Error('Database error') })),
              })),
            })),
            delete: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(() => Promise.resolve({ data: null, error: new Error('Database error') })),
            })),
            then: vi.fn().mockImplementation((resolve) => resolve({ data: null, count: null, error: new Error('Database error') })),
          }
          return failChain
        }

        if (table === 'sales_agent_knowledge_documents') {
          return {
            select: () => createChainableQuery(mockDocuments),
            insert: (row: any) => {
              const inserted = { id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...row }
              mockDocuments.push(inserted)
              return {
                select: () => ({
                  single: () => Promise.resolve({ data: inserted, error: null }),
                }),
              }
            },
            update: (updates: any) => {
              let targetId: string | null = null
              const updateChain: any = {
                eq: vi.fn().mockImplementation((field: string, val: any) => {
                  if (field === 'id') targetId = val
                  return updateChain
                }),
                select: () => ({
                  single: () => {
                    const doc = mockDocuments.find((d) => d.id === targetId)
                    if (doc) {
                      Object.assign(doc, updates)
                      return Promise.resolve({ data: doc, error: null })
                    }
                    return Promise.resolve({ data: null, error: new Error('Not found') })
                  },
                }),
              }
              return updateChain
            },
            delete: () => {
              const delChain: any = {
                eq: vi.fn().mockImplementation((field: string, val: any) => {
                  if (field === 'id') {
                    mockDocuments = mockDocuments.filter((d) => d.id !== val)
                    mockChunks = mockChunks.filter((c) => c.document_id !== val)
                  }
                  return Promise.resolve({ data: null, error: null })
                }),
              }
              return delChain
            },
          }
        }

        if (table === 'sales_agent_knowledge_chunks') {
          return {
            delete: () => ({
              eq: vi.fn().mockImplementation((field: string, val: any) => {
                if (field === 'document_id') {
                  mockChunks = mockChunks.filter((c) => c.document_id !== val)
                }
                return Promise.resolve({ data: null, error: null })
              }),
            }),
            insert: (rows: any[]) => {
              mockChunks.push(...rows)
              return Promise.resolve({ data: rows, error: null })
            },
            update: (updates: any) => ({
              eq: vi.fn().mockImplementation((field: string, val: any) => {
                if (field === 'document_id') {
                  mockChunks.forEach((c) => {
                    if (c.document_id === val) Object.assign(c, updates)
                  })
                }
                return Promise.resolve({ data: null, error: null })
              }),
            }),
          }
        }

        return {}
      },
    }),
  }
})

vi.mock('../cache/catalog-cache', () => {
  return {
    catalogCacheEngine: {
      getSnapshotAsync: vi.fn().mockImplementation(async () => {
        if (mockDbShouldFail) {
          throw new Error('Catalog cache connection failure')
        }
        return {
          knowledgeChunks: mockChunks.map((c, idx) => {
            const parentDoc = mockDocuments.find((d) => d.id === c.document_id)
            return {
              chunkId: c.id || `chunk-${c.document_id}-${idx}`,
              documentId: c.document_id,
              documentSlug: parentDoc?.slug || 'doc-slug',
              documentTitle: parentDoc?.title || 'Tiêu đề tài liệu',
              category: parentDoc?.category || 'WARRANTY_BATTERY',
              sectionTitle: c.section_title,
              content: c.content,
              tags: c.tags || [],
            }
          }),
        }
      }),
    },
  }
})

import {
  createKnowledgeDocument,
  getKnowledgeDocumentById,
  listKnowledgeDocuments,
  publishKnowledgeDocument,
  searchKnowledgeRepository,
  updateKnowledgeDocument,
  deleteKnowledgeDocument,
  archiveKnowledgeDocument,
} from './repository'

describe('Knowledge Repository - Strict Non-Fail-Open Containment', () => {
  beforeEach(() => {
    mockDocuments = []
    mockChunks = []
    mockDbShouldFail = false
  })

  it('throws error when database is unavailable on listKnowledgeDocuments', async () => {
    mockDbShouldFail = true
    await expect(listKnowledgeDocuments()).rejects.toThrow('Không thể tải danh sách tài liệu')
  })

  it('throws error when database is unavailable on getKnowledgeDocumentById', async () => {
    mockDbShouldFail = true
    await expect(getKnowledgeDocumentById('some-id')).rejects.toThrow('Không thể truy vấn tài liệu')
  })

  it('throws error when database is unavailable on createKnowledgeDocument', async () => {
    mockDbShouldFail = true
    await expect(
      createKnowledgeDocument({
        title: 'Thử nghiệm lỗi',
        category: 'WARRANTY_BATTERY',
        contentMarkdown: 'Nội dung',
      }),
    ).rejects.toThrow('Không thể tạo tài liệu')
  })

  it('supports full lifecycle with real DB operations: create, update, publish, archive, and delete', async () => {
    // 1. Create
    const doc = await createKnowledgeDocument({
      title: 'Chính sách bảo hiểm thân vỏ xe',
      category: 'TECHNICAL_GUIDE',
      contentMarkdown: '# Bảo hiểm thân vỏ\n## 1. Quyền lợi\nBồi thường 100% khi gặp sự cố chính hãng.',
    })

    expect(doc.id).toBeDefined()
    expect(doc.status).toBe('DRAFT')
    expect(doc.publishedVersion).toBe(0)

    // 2. Read by ID
    const fetched = await getKnowledgeDocumentById(doc.id)
    expect(fetched).not.toBeNull()
    expect(fetched?.title).toBe('Chính sách bảo hiểm thân vỏ xe')

    // 3. Update
    const updated = await updateKnowledgeDocument(doc.id, {
      title: 'Chính sách bảo hiểm thân vỏ xe FASTLANE',
    })
    expect(updated.title).toContain('FASTLANE')

    // 4. Publish
    const published = await publishKnowledgeDocument(doc.id)
    expect(published.document.status).toBe('PUBLISHED')
    expect(published.document.publishedVersion).toBe(1)
    expect(published.chunksCount).toBeGreaterThan(0)
    expect(mockChunks.length).toBeGreaterThan(0)

    // 5. Search finds matching chunk
    const searchMatches = await searchKnowledgeRepository('bảo hiểm thân vỏ', 2)
    expect(searchMatches.length).toBeGreaterThan(0)
    expect(searchMatches[0].documentId).toBe(doc.id)

    // 6. Search for non-existing query returns empty array (NO_MATCH), not fabricated seeds
    const noMatches = await searchKnowledgeRepository('không bao giờ có trong cơ sở dữ liệu xyz', 2)
    expect(noMatches).toEqual([])

    // 7. Archive
    const archived = await archiveKnowledgeDocument(doc.id)
    expect(archived.status).toBe('ARCHIVED')

    // 8. Delete
    const deleted = await deleteKnowledgeDocument(doc.id)
    expect(deleted).toBe(true)
    expect(mockDocuments.length).toBe(0)
    expect(mockChunks.length).toBe(0)
  })

  it('returns empty array when search query is empty or no chunks exist', async () => {
    const emptyQuery = await searchKnowledgeRepository('')
    expect(emptyQuery).toEqual([])

    const noChunks = await searchKnowledgeRepository('bảo hành')
    expect(noChunks).toEqual([])
  })

  it('propagates error when cache engine fails during searchKnowledgeRepository', async () => {
    mockDbShouldFail = true
    await expect(searchKnowledgeRepository('pin')).rejects.toThrow('Catalog cache connection failure')
  })
})
