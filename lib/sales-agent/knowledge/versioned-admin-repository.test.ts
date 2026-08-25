import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockState = vi.hoisted(() => ({
  documents: [] as Array<Record<string, unknown>>,
  versions: [] as Array<Record<string, unknown>>,
  selections: [] as Array<{ table: string; columns: string }>,
  ranges: [] as Array<[number, number]>,
  versionDocumentIds: [] as string[],
}))

vi.mock('@/lib/supabase-admin', () => {
  function project(row: Record<string, unknown>, columns: string) {
    return Object.fromEntries(columns.split(',').map((column) => {
      const key = column.trim()
      return [key, row[key]]
    }))
  }

  function createQuery(table: string, columns: string, countRequested: boolean) {
    let rows = [...(table === 'sales_agent_knowledge_documents' ? mockState.documents : mockState.versions)]
    let range: [number, number] | undefined

    const query: any = {
      eq(field: string, value: unknown) {
        rows = rows.filter((row) => row[field] === value)
        return query
      },
      neq(field: string, value: unknown) {
        rows = rows.filter((row) => row[field] !== value)
        return query
      },
      is(field: string, value: unknown) {
        rows = rows.filter((row) => row[field] === value)
        return query
      },
      in(field: string, values: unknown[]) {
        rows = rows.filter((row) => values.includes(row[field]))
        if (field === 'document_id') mockState.versionDocumentIds.push(...values.map(String))
        return query
      },
      order(field: string, options?: { ascending?: boolean }) {
        const direction = options?.ascending === false ? -1 : 1
        rows.sort((left, right) => String(left[field]).localeCompare(String(right[field])) * direction)
        return query
      },
      range(from: number, to: number) {
        range = [from, to]
        mockState.ranges.push(range)
        return query
      },
      then(resolve: (result: unknown) => unknown) {
        const total = rows.length
        const selectedRows = range ? rows.slice(range[0], range[1] + 1) : rows
        return Promise.resolve(resolve({
          data: selectedRows.map((row) => project(row, columns)),
          count: countRequested ? total : null,
          error: null,
        }))
      },
    }

    return query
  }

  return {
    getSupabaseAdmin: () => ({
      from: (table: string) => ({
        select: (columns: string, options?: { count?: string }) => {
          mockState.selections.push({ table, columns })
          return createQuery(table, columns, options?.count === 'exact')
        },
      }),
    }),
  }
})

import { getKnowledgeDocumentById, listKnowledgeDocuments } from './versioned-admin-repository'

function documentRow(id: string, updatedAt: string) {
  return {
    id,
    slug: id,
    title: `Tài liệu ${id}`,
    category: 'TECHNICAL_GUIDE',
    status: 'DRAFT',
    published_version: 0,
    content_markdown: `# Nội dung rất dài của ${id}`,
    summary: `Tóm tắt ${id}`,
    author_email: 'admin@example.com',
    created_at: updatedAt,
    updated_at: updatedAt,
    published_at: null,
    active_version_id: null,
    lifecycle_status: 'ACTIVE',
    deleted_at: null,
  }
}

function versionRow(documentId: string, createdAt: string) {
  return {
    id: `version-${documentId}`,
    document_id: documentId,
    version_no: 1,
    content_markdown: `# Nội dung rất dài của ${documentId}`,
    content_checksum: `checksum-${documentId}`,
    summary: `Tóm tắt ${documentId}`,
    publication_status: 'DRAFT',
    index_status: 'PENDING',
    approved_at: null,
    effective_from: createdAt,
    effective_to: null,
    created_at: createdAt,
  }
}

describe('versioned admin knowledge list payload', () => {
  beforeEach(() => {
    mockState.documents = [
      documentRow('doc-old', '2026-08-19T00:00:00.000Z'),
      documentRow('doc-new', '2026-08-20T00:00:00.000Z'),
    ]
    mockState.versions = [
      versionRow('doc-old', '2026-08-19T00:00:00.000Z'),
      versionRow('doc-new', '2026-08-20T00:00:00.000Z'),
    ]
    mockState.selections = []
    mockState.ranges = []
    mockState.versionDocumentIds = []
  })

  it('paginates documents in Supabase and excludes markdown from list queries', async () => {
    const result = await listKnowledgeDocuments({ limit: 1, offset: 0 })

    expect(result.total).toBe(2)
    expect(result.documents).toHaveLength(1)
    expect(result.documents[0].id).toBe('doc-new')
    expect(result.documents[0]).not.toHaveProperty('contentMarkdown')
    expect(mockState.ranges).toEqual([[0, 0]])
    expect(mockState.versionDocumentIds).toEqual(['doc-new'])
    expect(mockState.selections).toHaveLength(2)
    expect(mockState.selections.every(({ columns }) => !columns.includes('content_markdown'))).toBe(true)
  })

  it('loads markdown only for the requested document detail', async () => {
    const document = await getKnowledgeDocumentById('doc-old')

    expect(document?.contentMarkdown).toBe('# Nội dung rất dài của doc-old')
    expect(mockState.versionDocumentIds).toEqual(['doc-old'])
    expect(mockState.selections).toHaveLength(2)
    expect(mockState.selections.every(({ columns }) => columns.includes('content_markdown'))).toBe(true)
  })
})
