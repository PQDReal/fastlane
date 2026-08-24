import 'server-only'

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { normalizeProductSearchText } from '@/lib/catalog/search'

const SCOPE_CATALOG_TTL_MS = 5 * 60 * 1000
const MAX_DOCUMENT_ROWS = 1000

export type KnowledgeScopeCatalogEntry = {
  documentId: string
  documentKey: string
  category?: string
  vehicleModel?: string
  modelYearFrom?: number
  modelYearTo?: number
  versionId: string
  versionNo: number
  effectiveFrom?: string
  effectiveTo?: string | null
}

export type KnowledgeScopeCatalogSnapshot = {
  status: 'READY' | 'EMPTY' | 'UNAVAILABLE'
  entries: KnowledgeScopeCatalogEntry[]
  refreshedAt: number
  knowledgeEpoch?: number
  indexGenerationId?: string
}

function isCurrentEffectiveVersion(row: any, nowMs: number) {
  const effectiveFrom = Date.parse(String(row.effective_from || ''))
  const effectiveTo = row.effective_to == null ? Number.POSITIVE_INFINITY : Date.parse(String(row.effective_to))
  return (!Number.isFinite(effectiveFrom) || effectiveFrom <= nowMs)
    && (!Number.isFinite(effectiveTo) || effectiveTo > nowMs)
}

function normalizeEntry(row: any, version: any): KnowledgeScopeCatalogEntry | null {
  const documentId = String(row?.id || '')
  const versionId = String(version?.id || '')
  const documentKey = String(row?.document_key || row?.slug || '')
  if (!documentId || !versionId || !documentKey) return null

  const model = typeof row?.vehicle_model === 'string' && row.vehicle_model.trim()
    ? row.vehicle_model.trim()
    : undefined
  const modelYear = Number.isInteger(row?.model_year) ? Number(row.model_year) : undefined
  return {
    documentId,
    documentKey,
    ...(row?.category ? { category: String(row.category) } : {}),
    ...(model ? { vehicleModel: model } : {}),
    ...(modelYear != null ? { modelYearFrom: modelYear, modelYearTo: modelYear } : {}),
    versionId,
    versionNo: Number.isInteger(version?.version_no) ? Number(version.version_no) : 0,
    effectiveFrom: version?.effective_from ? String(version.effective_from) : undefined,
    effectiveTo: version?.effective_to == null ? null : String(version.effective_to),
  }
}

export class KnowledgeScopeCatalogEngine {
  private snapshot: KnowledgeScopeCatalogSnapshot = {
    status: 'EMPTY',
    entries: [],
    refreshedAt: 0,
  }

  private refreshPromise: Promise<KnowledgeScopeCatalogSnapshot> | null = null

  getSnapshot() {
    if (Date.now() - this.snapshot.refreshedAt > SCOPE_CATALOG_TTL_MS && !this.refreshPromise) {
      void this.refresh()
    }
    return this.snapshot
  }

  async getSnapshotAsync() {
    if (Date.now() - this.snapshot.refreshedAt <= SCOPE_CATALOG_TTL_MS) return this.snapshot
    return this.refresh()
  }

  async refresh(): Promise<KnowledgeScopeCatalogSnapshot> {
    if (this.refreshPromise) return this.refreshPromise

    this.refreshPromise = (async () => {
      try {
        const client = getSupabaseAdmin() as any
        const runtimeResult = typeof client?.rpc === 'function'
          ? await client.rpc('sales_agent_get_knowledge_runtime_state')
          : { data: null, error: null }
        if (runtimeResult?.error) throw new Error(runtimeResult.error.message || 'Knowledge runtime state unavailable')

        const documentQuery = client?.from?.('sales_agent_knowledge_documents')
        if (!documentQuery?.select) throw new Error('Knowledge scope catalog client unavailable')
        const documentResult = await documentQuery
          .select('id,document_key,slug,category,vehicle_model,model_year,market,locale,active_version_id,lifecycle_status,deleted_at')
          .limit(MAX_DOCUMENT_ROWS)
        if (documentResult?.error) throw new Error(documentResult.error.message || 'Knowledge document inventory unavailable')

        const documents = (Array.isArray(documentResult?.data) ? documentResult.data : [])
          .filter((row: any) => row.lifecycle_status !== 'DELETED' && row.deleted_at == null)
          .filter((row: any) => (row.market || 'VN') === 'VN' && (row.locale || 'vi-VN') === 'vi-VN')
          .filter((row: any) => row.active_version_id)
        const documentIds = documents.map((row: any) => String(row.id))

        let versions: any[] = []
        if (documentIds.length > 0) {
          const versionQuery = client?.from?.('sales_agent_knowledge_versions')
          if (!versionQuery?.select) throw new Error('Knowledge version inventory unavailable')
          const versionResult = await versionQuery
            .select('id,document_id,version_no,publication_status,index_status,effective_from,effective_to')
            .in('document_id', documentIds)
          if (versionResult?.error) throw new Error(versionResult.error.message || 'Knowledge version inventory unavailable')
          versions = Array.isArray(versionResult?.data) ? versionResult.data : []
        }

        const versionsById = new Map(versions.map((version) => [String(version.id), version]))
        const nowMs = Date.now()
        const entries = documents.flatMap((document: any) => {
          const version = versionsById.get(String(document.active_version_id))
          if (!version) return []
          if (version.publication_status !== 'PUBLISHED' || version.index_status !== 'READY') return []
          if (!isCurrentEffectiveVersion(version, nowMs)) return []
          const entry = normalizeEntry(document, version)
          return entry ? [entry] : []
        })

        const runtime = runtimeResult?.data
        this.snapshot = {
          status: entries.length > 0 ? 'READY' : 'EMPTY',
          entries,
          refreshedAt: Date.now(),
          knowledgeEpoch: Number.isSafeInteger(Number(runtime?.knowledge_epoch))
            ? Number(runtime.knowledge_epoch)
            : undefined,
          indexGenerationId: runtime?.active_index_generation_id ? String(runtime.active_index_generation_id) : undefined,
        }
      } catch (error) {
        console.warn('[KNOWLEDGE SCOPE CATALOG] Refresh unavailable:', error instanceof Error ? error.message : error)
        this.snapshot = {
          ...this.snapshot,
          status: this.snapshot.entries.length > 0 ? 'READY' : 'UNAVAILABLE',
          refreshedAt: Date.now(),
        }
      } finally {
        this.refreshPromise = null
      }
      return this.snapshot
    })()

    return this.refreshPromise
  }

  getEntriesForModel(vehicleModel: string) {
    const target = normalizeProductSearchText(vehicleModel).replace(/\s+/g, '')
    return this.snapshot.entries.filter((entry) => {
      const model = normalizeProductSearchText(entry.vehicleModel).replace(/\s+/g, '')
      return model && model === target
    })
  }

  getLatestYearForModel(vehicleModel: string) {
    const years = this.getAvailableYearsForModel(vehicleModel)
    return years.length > 0 ? Math.max(...years) : undefined
  }

  getAvailableYearsForModel(vehicleModel: string) {
    const years = this.getEntriesForModel(vehicleModel)
      .flatMap((entry) => [entry.modelYearFrom, entry.modelYearTo])
      .filter((year): year is number => Number.isInteger(year))
    return [...new Set(years)].sort((left, right) => left - right)
  }
}

export const knowledgeScopeCatalogEngine = new KnowledgeScopeCatalogEngine()
