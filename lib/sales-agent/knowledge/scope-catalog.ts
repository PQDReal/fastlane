import 'server-only'

import { recordSalesAgentDebugEvent } from '../debug-log'

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { normalizeProductSearchText } from '@/lib/catalog/search'

export const SCOPE_CATALOG_TTL_MS = 30 * 60 * 1000 // 30 minutes, synchronized with Product Catalog Cache
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
  isSeededFallback?: boolean
}

export const INITIAL_SEEDED_SCOPE_ENTRIES: KnowledgeScopeCatalogEntry[] = [
  // VF 3 (2024 - 2026)
  { documentId: 'seed-vf3-2024', documentKey: 'vinfast:vf-3:2024:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'VF 3', modelYearFrom: 2024, modelYearTo: 2024, versionId: 'ver-seed-vf3-2024', versionNo: 1 },
  { documentId: 'seed-vf3-2025', documentKey: 'vinfast:vf-3:2025:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'VF 3', modelYearFrom: 2025, modelYearTo: 2025, versionId: 'ver-seed-vf3-2025', versionNo: 1 },
  { documentId: 'seed-vf3-2026', documentKey: 'vinfast:vf-3:2026:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'VF 3', modelYearFrom: 2026, modelYearTo: 2026, versionId: 'ver-seed-vf3-2026', versionNo: 1 },

  // VF 5 (2023 - 2026)
  { documentId: 'seed-vf5-2023', documentKey: 'vinfast:vf-5:2023:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'VF 5', modelYearFrom: 2023, modelYearTo: 2023, versionId: 'ver-seed-vf5-2023', versionNo: 1 },
  { documentId: 'seed-vf5-2024', documentKey: 'vinfast:vf-5:2024:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'VF 5', modelYearFrom: 2024, modelYearTo: 2024, versionId: 'ver-seed-vf5-2024', versionNo: 1 },
  { documentId: 'seed-vf5-2025', documentKey: 'vinfast:vf-5:2025:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'VF 5', modelYearFrom: 2025, modelYearTo: 2025, versionId: 'ver-seed-vf5-2025', versionNo: 1 },
  { documentId: 'seed-vf5-2026', documentKey: 'vinfast:vf-5:2026:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'VF 5', modelYearFrom: 2026, modelYearTo: 2026, versionId: 'ver-seed-vf5-2026', versionNo: 1 },

  // VF 6 (2023 - 2026)
  { documentId: 'seed-vf6-2023', documentKey: 'vinfast:vf-6:2023:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'VF 6', modelYearFrom: 2023, modelYearTo: 2023, versionId: 'ver-seed-vf6-2023', versionNo: 1 },
  { documentId: 'seed-vf6-2024', documentKey: 'vinfast:vf-6:2024:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'VF 6', modelYearFrom: 2024, modelYearTo: 2024, versionId: 'ver-seed-vf6-2024', versionNo: 1 },
  { documentId: 'seed-vf6-2025', documentKey: 'vinfast:vf-6:2025:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'VF 6', modelYearFrom: 2025, modelYearTo: 2025, versionId: 'ver-seed-vf6-2025', versionNo: 1 },
  { documentId: 'seed-vf6-2026', documentKey: 'vinfast:vf-6:2026:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'VF 6', modelYearFrom: 2026, modelYearTo: 2026, versionId: 'ver-seed-vf6-2026', versionNo: 1 },

  // VF 7 (2024 - 2026)
  { documentId: 'seed-vf7-2024', documentKey: 'vinfast:vf-7:2024:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'VF 7', modelYearFrom: 2024, modelYearTo: 2024, versionId: 'ver-seed-vf7-2024', versionNo: 1 },
  { documentId: 'seed-vf7-2025', documentKey: 'vinfast:vf-7:2025:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'VF 7', modelYearFrom: 2025, modelYearTo: 2025, versionId: 'ver-seed-vf7-2025', versionNo: 1 },
  { documentId: 'seed-vf7-2026', documentKey: 'vinfast:vf-7:2026:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'VF 7', modelYearFrom: 2026, modelYearTo: 2026, versionId: 'ver-seed-vf7-2026', versionNo: 1 },

  // VF 8 (2022 - 2026)
  { documentId: 'seed-vf8-2022', documentKey: 'vinfast:vf-8:2022:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'VF 8', modelYearFrom: 2022, modelYearTo: 2022, versionId: 'ver-seed-vf8-2022', versionNo: 1 },
  { documentId: 'seed-vf8-2023', documentKey: 'vinfast:vf-8:2023:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'VF 8', modelYearFrom: 2023, modelYearTo: 2023, versionId: 'ver-seed-vf8-2023', versionNo: 1 },
  { documentId: 'seed-vf8-2024', documentKey: 'vinfast:vf-8:2024:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'VF 8', modelYearFrom: 2024, modelYearTo: 2024, versionId: 'ver-seed-vf8-2024', versionNo: 1 },
  { documentId: 'seed-vf8-2025', documentKey: 'vinfast:vf-8:2025:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'VF 8', modelYearFrom: 2025, modelYearTo: 2025, versionId: 'ver-seed-vf8-2025', versionNo: 1 },
  { documentId: 'seed-vf8-2026', documentKey: 'vinfast:vf-8:2026:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'VF 8', modelYearFrom: 2026, modelYearTo: 2026, versionId: 'ver-seed-vf8-2026', versionNo: 1 },
  { documentId: 'seed-vf8-my26-2026', documentKey: 'vinfast:vf-8-my26:2026:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'VF 8 - MY26', modelYearFrom: 2026, modelYearTo: 2026, versionId: 'ver-seed-vf8-my26-2026', versionNo: 1 },

  // VF 9 (2023 - 2026)
  { documentId: 'seed-vf9-2023', documentKey: 'vinfast:vf-9:2023:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'VF 9', modelYearFrom: 2023, modelYearTo: 2023, versionId: 'ver-seed-vf9-2023', versionNo: 1 },
  { documentId: 'seed-vf9-2024', documentKey: 'vinfast:vf-9:2024:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'VF 9', modelYearFrom: 2024, modelYearTo: 2024, versionId: 'ver-seed-vf9-2024', versionNo: 1 },
  { documentId: 'seed-vf9-2025', documentKey: 'vinfast:vf-9:2025:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'VF 9', modelYearFrom: 2025, modelYearTo: 2025, versionId: 'ver-seed-vf9-2025', versionNo: 1 },
  { documentId: 'seed-vf9-2026', documentKey: 'vinfast:vf-9:2026:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'VF 9', modelYearFrom: 2026, modelYearTo: 2026, versionId: 'ver-seed-vf9-2026', versionNo: 1 },

  // VF e34 (2021 - 2024)
  { documentId: 'seed-vfe34-2021', documentKey: 'vinfast:vf-e34:2021:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'VF e34', modelYearFrom: 2021, modelYearTo: 2021, versionId: 'ver-seed-vfe34-2021', versionNo: 1 },
  { documentId: 'seed-vfe34-2022', documentKey: 'vinfast:vf-e34:2022:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'VF e34', modelYearFrom: 2022, modelYearTo: 2022, versionId: 'ver-seed-vfe34-2022', versionNo: 1 },
  { documentId: 'seed-vfe34-2023', documentKey: 'vinfast:vf-e34:2023:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'VF e34', modelYearFrom: 2023, modelYearTo: 2023, versionId: 'ver-seed-vfe34-2023', versionNo: 1 },
  { documentId: 'seed-vfe34-2024', documentKey: 'vinfast:vf-e34:2024:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'VF e34', modelYearFrom: 2024, modelYearTo: 2024, versionId: 'ver-seed-vfe34-2024', versionNo: 1 },

  // VF MPV 7 (2026)
  { documentId: 'seed-vfmpv7-2026', documentKey: 'vinfast:vf-mpv-7:2026:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'VF MPV 7', modelYearFrom: 2026, modelYearTo: 2026, versionId: 'ver-seed-vfmpv7-2026', versionNo: 1 },

  // Lạc Hồng 900 LX (2025 - 2026)
  { documentId: 'seed-lachong-2025', documentKey: 'vinfast:lac-hong-900-lx:2025:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'Lạc Hồng 900 LX', modelYearFrom: 2025, modelYearTo: 2025, versionId: 'ver-seed-lachong-2025', versionNo: 1 },
  { documentId: 'seed-lachong-2026', documentKey: 'vinfast:lac-hong-900-lx:2026:vi-VN', category: 'TECHNICAL_GUIDE', vehicleModel: 'Lạc Hồng 900 LX', modelYearFrom: 2026, modelYearTo: 2026, versionId: 'ver-seed-lachong-2026', versionNo: 1 },

  // Policy & Procedures
  { documentId: 'seed-warranty', documentKey: 'chinh-sach-bao-hanh-xe-dien-vinfast', category: 'WARRANTY_BATTERY', versionId: 'ver-seed-warranty', versionNo: 1 },
  { documentId: 'seed-charging', documentKey: 'chinh-sach-thue-pin-va-he-thong-tram-sac', category: 'CHARGING_NETWORK', versionId: 'ver-seed-charging', versionNo: 1 },
  { documentId: 'seed-deposit', documentKey: 'quy-trinh-dat-coc-va-nhan-xe-fastlane', category: 'DEPOSIT_DELIVERY', versionId: 'ver-seed-deposit', versionNo: 1 },
  { documentId: 'seed-financing', documentKey: 'chinh-sach-tra-gop-va-uu-dai-tai-chinh', category: 'PROMOTIONS_FINANCING', versionId: 'ver-seed-financing', versionNo: 1 },
]

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
  private static instance: KnowledgeScopeCatalogEngine
  private snapshot: KnowledgeScopeCatalogSnapshot
  private isRefreshing: boolean = false
  private refreshPromise: Promise<KnowledgeScopeCatalogSnapshot> | null = null

  public constructor() {
    this.snapshot = {
      status: 'READY',
      entries: INITIAL_SEEDED_SCOPE_ENTRIES,
      refreshedAt: 0, // 0 forces initial background refresh
      isSeededFallback: true,
    }
  }

  public static getInstance(): KnowledgeScopeCatalogEngine {
    if (!KnowledgeScopeCatalogEngine.instance) {
      KnowledgeScopeCatalogEngine.instance = new KnowledgeScopeCatalogEngine()
    }
    return KnowledgeScopeCatalogEngine.instance
  }

  public getSnapshot(): KnowledgeScopeCatalogSnapshot {
    const now = Date.now()
    const ageMs = this.snapshot.refreshedAt === 0 ? 0 : now - this.snapshot.refreshedAt
    // Stale-While-Revalidate: Trigger background refresh if older than 30 minutes
    if (now - this.snapshot.refreshedAt > SCOPE_CATALOG_TTL_MS && !this.isRefreshing) {
      console.log(`[KNOWLEDGE SCOPE CATALOG] Cache expired (age: ${Math.floor(ageMs / 1000)}s, TTL: ${SCOPE_CATALOG_TTL_MS / 1000}s), triggering background revalidation...`)
      void this.revalidateAsync(false)
    }
    return this.snapshot
  }

  public async getSnapshotAsync(): Promise<KnowledgeScopeCatalogSnapshot> {
    if (this.snapshot.refreshedAt === 0) {
      console.log('[KNOWLEDGE SCOPE CATALOG] Initial cold-start access (refreshedAt: 0), awaiting revalidation from DB...')
      await this.revalidateAsync(true)
    } else if (Date.now() - this.snapshot.refreshedAt > SCOPE_CATALOG_TTL_MS && !this.isRefreshing) {
      void this.revalidateAsync(false)
    }
    return this.snapshot
  }

  public async forceRefresh(): Promise<KnowledgeScopeCatalogSnapshot> {
    console.log('[KNOWLEDGE SCOPE CATALOG] Force refresh requested.')
    return this.revalidateAsync(true)
  }

  /** Backward-compatible alias for revalidateAsync */
  public async refresh(): Promise<KnowledgeScopeCatalogSnapshot> {
    return this.revalidateAsync(true)
  }

  public getStatus() {
    const now = Date.now()
    const ageMs = this.snapshot.refreshedAt === 0 ? 0 : now - this.snapshot.refreshedAt
    return {
      status: this.snapshot.status,
      refreshedAt: this.snapshot.refreshedAt,
      ageSeconds: Math.floor(ageMs / 1000),
      isExpired: ageMs > SCOPE_CATALOG_TTL_MS,
      isRefreshing: this.isRefreshing,
      isSeededFallback: Boolean(this.snapshot.isSeededFallback),
      entriesCount: this.snapshot.entries.length,
      modelsCount: this.getAvailableModels().length,
      knowledgeEpoch: this.snapshot.knowledgeEpoch,
      indexGenerationId: this.snapshot.indexGenerationId,
    }
  }

  public async revalidateAsync(force: boolean = false): Promise<KnowledgeScopeCatalogSnapshot> {
    if (this.isRefreshing && this.refreshPromise && !force) {
      return this.refreshPromise
    }

    const startTime = Date.now()
    console.log(`[KNOWLEDGE SCOPE CATALOG] Revalidation started (force: ${force})...`)
    recordSalesAgentDebugEvent('knowledge.scope_catalog.refresh.started', {}, {
      force,
    })
    this.isRefreshing = true
    this.refreshPromise = this.fetchFromDatabase()
      .then((newSnapshot) => {
        // Atomic swapping: swap active snapshot only when fetch succeeded
        this.snapshot = newSnapshot
        this.isRefreshing = false
        this.refreshPromise = null
        const elapsed = Date.now() - startTime
        const uniqueModels = this.getAvailableModels().join(', ')
        console.log(`[KNOWLEDGE SCOPE CATALOG] Revalidation succeeded in ${elapsed}ms -> ${newSnapshot.entries.length} entries across models: [${uniqueModels}] (epoch: ${newSnapshot.knowledgeEpoch ?? 'N/A'}, isSeeded: ${Boolean(newSnapshot.isSeededFallback)})`)
        recordSalesAgentDebugEvent('knowledge.scope_catalog.refresh.completed', {}, {
          force,
          status: newSnapshot.status,
          entryCount: newSnapshot.entries.length,
          knowledgeEpoch: newSnapshot.knowledgeEpoch,
          isSeededFallback: Boolean(newSnapshot.isSeededFallback),
          elapsedMs: elapsed,
        })
        return newSnapshot
      })
      .catch((err) => {
        const elapsed = Date.now() - startTime
        console.warn(`[KNOWLEDGE SCOPE CATALOG] Background revalidation failed gracefully after ${elapsed}ms, keeping existing snapshot (${this.snapshot.entries.length} entries):`, err?.message || err)
        recordSalesAgentDebugEvent('knowledge.scope_catalog.refresh.failed', {}, {
          force,
          retainedEntryCount: this.snapshot.entries.length,
          elapsedMs: elapsed,
          error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
        })
        this.isRefreshing = false
        this.refreshPromise = null
        this.snapshot = {
          ...this.snapshot,
          status: this.snapshot.entries.length > 0 ? 'READY' : 'UNAVAILABLE',
          refreshedAt: Date.now() - (SCOPE_CATALOG_TTL_MS - 60000), // retry in 1 minute
        }
        return this.snapshot
      })

    return this.refreshPromise
  }

  private async fetchFromDatabase(): Promise<KnowledgeScopeCatalogSnapshot> {
    const client = getSupabaseAdmin() as any
    const documentQuery = client?.from?.('sales_agent_knowledge_documents')
    if (!documentQuery?.select) throw new Error('Knowledge scope catalog client unavailable')

    const dbPromise = (async () => {
      const step1Start = Date.now()
      const [runtimeResult, documentResult] = await Promise.all([
        typeof client?.rpc === 'function'
          ? client.rpc('sales_agent_get_knowledge_runtime_state')
          : Promise.resolve({ data: null, error: null }),
        documentQuery
          .select('id,document_key,slug,category,vehicle_model,model_year,market,locale,active_version_id,lifecycle_status,deleted_at')
          .limit(MAX_DOCUMENT_ROWS),
      ])
      if (runtimeResult?.error) throw new Error(runtimeResult.error.message || 'Knowledge runtime state unavailable')
      if (documentResult?.error) throw new Error(documentResult.error.message || 'Knowledge document inventory unavailable')

      const documents = (Array.isArray(documentResult?.data) ? documentResult.data : [])
        .filter((row: any) => row.lifecycle_status !== 'DELETED' && row.deleted_at == null)
        .filter((row: any) => (row.market || 'VN') === 'VN' && (row.locale || 'vi-VN') === 'vi-VN')
        .filter((row: any) => row.active_version_id)
      const documentIds = documents.map((row: any) => String(row.id))
      console.log(`[KNOWLEDGE SCOPE CATALOG] DB Step 1: fetched ${documents.length} active documents in ${Date.now() - step1Start}ms`)

      const step2Start = Date.now()
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
      console.log(`[KNOWLEDGE SCOPE CATALOG] DB Step 2: fetched ${versions.length} versions for ${documentIds.length} documents in ${Date.now() - step2Start}ms`)

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
      const finalEntries = entries.length > 0 ? entries : INITIAL_SEEDED_SCOPE_ENTRIES

      return {
        status: finalEntries.length > 0 ? 'READY' as const : 'EMPTY' as const,
        entries: finalEntries,
        refreshedAt: Date.now(),
        knowledgeEpoch: Number.isSafeInteger(Number(runtime?.knowledge_epoch))
          ? Number(runtime.knowledge_epoch)
          : undefined,
        indexGenerationId: runtime?.active_index_generation_id ? String(runtime.active_index_generation_id) : undefined,
        isSeededFallback: entries.length === 0,
      }
    })()

    // 8s timeout guard for background revalidation
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Supabase scope catalog fetch timeout')), 8000),
    )

    return Promise.race([dbPromise, timeoutPromise])
  }

  public getEntriesForModel(vehicleModel: string) {
    const target = normalizeProductSearchText(vehicleModel).replace(/\s+/g, '')
    return this.snapshot.entries.filter((entry) => {
      const model = normalizeProductSearchText(entry.vehicleModel).replace(/\s+/g, '')
      return model && model === target
    })
  }

  public getLatestYearForModel(vehicleModel: string) {
    const years = this.getAvailableYearsForModel(vehicleModel)
    return years.length > 0 ? Math.max(...years) : undefined
  }

  public getAvailableYearsForModel(vehicleModel: string) {
    const years = this.getEntriesForModel(vehicleModel)
      .flatMap((entry) => [entry.modelYearFrom, entry.modelYearTo])
      .filter((year): year is number => Number.isInteger(year))
    return [...new Set(years)].sort((left, right) => left - right)
  }

  public getAvailableModels() {
    const models = new Map<string, string>()
    for (const entry of this.snapshot.entries) {
      const model = entry.vehicleModel?.trim()
      if (!model) continue
      const key = normalizeProductSearchText(model).replace(/\s+/g, '')
      if (key && !models.has(key)) models.set(key, model)
    }
    return [...models.values()].sort((left, right) => left.localeCompare(right, 'vi'))
  }

  public getAvailableYearsForModelFromSnapshot(vehicleModel: string, snapshot: KnowledgeScopeCatalogSnapshot = this.snapshot) {
    const target = normalizeProductSearchText(vehicleModel).replace(/\s+/g, '')
    const years = snapshot.entries
      .filter((entry) => normalizeProductSearchText(entry.vehicleModel).replace(/\s+/g, '') === target)
      .flatMap((entry) => [entry.modelYearFrom, entry.modelYearTo])
      .filter((year): year is number => Number.isInteger(year))
    return [...new Set(years)].sort((left, right) => left - right)
  }
}

export const knowledgeScopeCatalogEngine = KnowledgeScopeCatalogEngine.getInstance()
