import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const getSupabaseAdminMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: getSupabaseAdminMock }))

import {
  KnowledgeScopeCatalogEngine,
  INITIAL_SEEDED_SCOPE_ENTRIES,
  SCOPE_CATALOG_TTL_MS,
} from './scope-catalog'

describe('knowledge scope catalog engine', () => {
  let engine: KnowledgeScopeCatalogEngine

  beforeEach(() => {
    vi.clearAllMocks()
    engine = new KnowledgeScopeCatalogEngine()
  })

  it('initializes with baseline seeded entries immediately (cold-start ready)', () => {
    const snapshot = engine.getSnapshot()
    expect(snapshot.status).toBe('READY')
    expect(snapshot.entries.length).toBeGreaterThanOrEqual(25)
    expect(snapshot.isSeededFallback).toBe(true)

    const status = engine.getStatus()
    expect(status.isSeededFallback).toBe(true)
    expect(status.entriesCount).toBe(snapshot.entries.length)
    expect(status.modelsCount).toBeGreaterThan(0)
    expect(engine.getAvailableModels()).toContain('VF 8')
    expect(engine.getAvailableYearsForModel('VF 5')).toContain(2026)
  })

  it('keeps only active published ready effective versions upon DB refresh', async () => {
    const now = new Date().toISOString()
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: { knowledge_epoch: 7, active_index_generation_id: 'gen-7' }, error: null }),
      from: vi.fn((table: string) => {
        if (table === 'sales_agent_knowledge_documents') {
          return {
            select: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({
                data: [
                  { id: 'doc-good', document_key: 'vf8-manual', category: 'TECHNICAL_GUIDE', vehicle_model: 'VF 8', model_year: 2026, active_version_id: 'ver-good', market: 'VN', locale: 'vi-VN', lifecycle_status: 'ACTIVE', deleted_at: null },
                  { id: 'doc-draft', document_key: 'vf8-draft', vehicle_model: 'VF 8', model_year: 2027, active_version_id: 'ver-draft', market: 'VN', locale: 'vi-VN', lifecycle_status: 'ACTIVE', deleted_at: null },
                  { id: 'doc-deleted', document_key: 'vf8-deleted', vehicle_model: 'VF 8', model_year: 2028, active_version_id: 'ver-deleted', market: 'VN', locale: 'vi-VN', lifecycle_status: 'DELETED', deleted_at: now },
                ],
                error: null,
              }),
            })),
          }
        }
        return {
          select: vi.fn(() => ({
            in: vi.fn().mockResolvedValue({
              data: [
                { id: 'ver-good', document_id: 'doc-good', version_no: 3, publication_status: 'PUBLISHED', index_status: 'READY', effective_from: '2025-01-01T00:00:00Z', effective_to: null },
                { id: 'ver-draft', document_id: 'doc-draft', version_no: 1, publication_status: 'DRAFT', index_status: 'READY', effective_from: '2025-01-01T00:00:00Z', effective_to: null },
              ],
              error: null,
            }),
          })),
        }
      }),
    }
    getSupabaseAdminMock.mockReturnValue(client)

    const snapshot = await engine.getSnapshotAsync()

    expect(snapshot.status).toBe('READY')
    expect(snapshot.entries).toHaveLength(1)
    expect(snapshot.entries[0]).toMatchObject({ vehicleModel: 'VF 8', modelYearFrom: 2026, versionNo: 3 })
    expect(snapshot.knowledgeEpoch).toBe(7)
    expect(snapshot.indexGenerationId).toBe('gen-7')
    expect(snapshot.isSeededFallback).toBe(false)
  })

  it('returns the latest model year from the ready inventory', async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: { knowledge_epoch: 1, active_index_generation_id: 'gen-1' }, error: null }),
      from: vi.fn((table: string) => table === 'sales_agent_knowledge_documents'
        ? { select: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: [
          { id: 'doc-1', document_key: 'vf8-2025', vehicle_model: 'VF 8', model_year: 2025, active_version_id: 'ver-1', market: 'VN', locale: 'vi-VN', lifecycle_status: 'ACTIVE', deleted_at: null },
          { id: 'doc-2', document_key: 'vf8-2026', vehicle_model: 'VF 8', model_year: 2026, active_version_id: 'ver-2', market: 'VN', locale: 'vi-VN', lifecycle_status: 'ACTIVE', deleted_at: null },
        ], error: null }) })) }
        : { select: vi.fn(() => ({ in: vi.fn().mockResolvedValue({ data: [
          { id: 'ver-1', document_id: 'doc-1', version_no: 1, publication_status: 'PUBLISHED', index_status: 'READY', effective_from: '2025-01-01T00:00:00Z', effective_to: null },
          { id: 'ver-2', document_id: 'doc-2', version_no: 1, publication_status: 'PUBLISHED', index_status: 'READY', effective_from: '2026-01-01T00:00:00Z', effective_to: null },
        ], error: null }) })) }),
    }
    getSupabaseAdminMock.mockReturnValue(client)

    await engine.getSnapshotAsync()

    expect(engine.getLatestYearForModel('VF 8')).toBe(2026)
  })

  it('supports force refresh without throwing on network failure', async () => {
    getSupabaseAdminMock.mockImplementation(() => {
      throw new Error('Supabase unreachable')
    })

    const refreshed = await engine.forceRefresh()
    expect(refreshed.status).toBe('READY')
    expect(refreshed.entries.length).toBeGreaterThan(0)

    const status = engine.getStatus()
    expect(status.status).toBe('READY')
    expect(status.entriesCount).toBeGreaterThan(0)
  })

  it('triggers background revalidation on getSnapshot when TTL expires', async () => {
    // Set timestamp to now (within TTL)
    ;(engine as any).snapshot.refreshedAt = Date.now()
    const revalidateSpy = vi.spyOn(engine, 'revalidateAsync')

    // Within TTL: does not revalidate
    engine.getSnapshot()
    expect(revalidateSpy).not.toHaveBeenCalled()

    // Simulate expired timestamp
    ;(engine as any).snapshot.refreshedAt = Date.now() - (SCOPE_CATALOG_TTL_MS + 1000)

    engine.getSnapshot()
    expect(revalidateSpy).toHaveBeenCalledWith(false)
  })
})
