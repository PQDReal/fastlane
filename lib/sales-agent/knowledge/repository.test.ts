import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createKnowledgeDocument,
  getKnowledgeDocumentById,
  listKnowledgeDocuments,
  publishKnowledgeDocument,
  searchKnowledgeRepository,
  updateKnowledgeDocument,
  deleteKnowledgeDocument,
} from './repository'

describe('Knowledge Repository', () => {
  it('lists seeded fallback documents', async () => {
    const res = await listKnowledgeDocuments()
    expect(res.documents.length).toBeGreaterThanOrEqual(4)
    expect(res.documents.some((d) => d.slug.includes('bao-hanh'))).toBe(true)
  })

  it('prioritizes verified motorbike battery-warranty context', async () => {
    const results = await searchKnowledgeRepository('bảo hành pin Evo', 4)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].documentSlug).toBe('chinh-sach-bao-hanh-pin-xe-may-dien-vinfast')
    expect(results.map((result) => result.content).join('\n')).toContain('ngày xuất hóa đơn')
    expect(results.some((result) => result.documentId === '00000000-0000-4000-8000-000000000001')).toBe(false)
    expect(results[0].score).toBeGreaterThan(0)
  })

  it('does not apply motorbike policy to an explicitly named car', async () => {
    const results = await searchKnowledgeRepository('bảo hành pin VF 8', 4)
    expect(results.some((result) => result.documentId === '00000000-0000-4000-8000-000000000005')).toBe(false)
  })

  it('supports full lifecycle: create, update, publish, and delete with cascade', async () => {
    const doc = await createKnowledgeDocument({
      title: 'Chính sách bảo hiểm thân vỏ xe',
      category: 'TECHNICAL_GUIDE',
      contentMarkdown: '# Bảo hiểm xe\n## 1. Quyền lợi\nBồi thường 100% khi gặp sự cố chính hãng.',
    })

    expect(doc.id).toBeDefined()
    expect(doc.status).toBe('DRAFT')
    expect(doc.publishedVersion).toBe(0)

    // Update
    const updated = await updateKnowledgeDocument(doc.id, {
      title: 'Chính sách bảo hiểm thân vỏ xe FASTLANE',
    })
    expect(updated.title).toContain('FASTLANE')

    // Publish
    const published = await publishKnowledgeDocument(doc.id)
    expect(published.document.status).toBe('PUBLISHED')
    expect(published.document.publishedVersion).toBe(1)
    expect(published.chunksCount).toBe(1)

    // Search matches new doc
    const searchRes = await searchKnowledgeRepository('bảo hiểm thân vỏ', 2)
    expect(searchRes.some((r) => r.documentId === doc.id)).toBe(true)

    // Delete
    const deleted = await deleteKnowledgeDocument(doc.id)
    expect(deleted).toBe(true)
  })
})
