import 'server-only'

import { performance } from 'node:perf_hooks'
import { browseCatalogRepository } from '../../catalog/browse'
import { getProductDetailsRepository } from '../../catalog/product-details'
import { compareProductsRepository } from '../../catalog/comparison'
import { getCurrentPromotionsRepository } from '../../catalog/promotions'
import { discoverSalesAgentAccessories } from '../../catalog/accessories'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { HybridHierarchicalRetrievalService } from '../../knowledge/retrieval/retrieval-service'
import { findApprovedVisualKnowledge } from '../../knowledge/visual-retrieval-repository'
import { isSalesAgentVisualKnowledgeRetrievalEnabled } from '../../core/flags'
import type { KnowledgeVisualMediaPointer } from '../../knowledge/retrieval/contracts'
import { guardUntrustedKnowledgeText } from '../../knowledge/untrusted-content'
import { detectKnowledgeAmbiguity } from '../../knowledge/ambiguity'
import type { KnowledgeScopeBinding } from '../../knowledge/scope-context'
import { knowledgeScopeCatalogEngine, type KnowledgeScopeCatalogSnapshot } from '../../knowledge/scope-catalog'
import type {
  AppliedBinding,
  BrowseCatalogInput,
  DataToolName,
  DiscoverAccessoriesInput,
  EvidenceRecord,
  FactPointer,
  GetProductDetailsInput,
  GetCurrentPromotionsInput,
  SearchKnowledgeInput,
  ToolObservationRef,
  ToolResult,
} from '../../contracts'

export type ExecuteDataToolOptions = {
  /** Server-derived scope. Model-provided vehicleModel/modelYear are never authoritative. */
  knowledgeScope?: KnowledgeScopeBinding | null
}

type KnowledgeScopeResolution = {
  defaultedModelYear?: number
  catalog?: Pick<KnowledgeScopeCatalogSnapshot, 'status' | 'entries' | 'knowledgeEpoch'>
}

async function loadKnowledgeScopeCatalog(): Promise<KnowledgeScopeCatalogSnapshot> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      knowledgeScopeCatalogEngine.getSnapshotAsync(),
      new Promise<KnowledgeScopeCatalogSnapshot>((resolve) => {
        timer = setTimeout(() => resolve({
          status: 'UNAVAILABLE',
          entries: [],
          refreshedAt: Date.now(),
        }), 800)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function normalizeScopeModel(value: unknown) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function rawModelHintForYearAmbiguity(rawModel: string | undefined, items: any[]) {
  if (!rawModel) return undefined
  const scopes = items.flatMap((item) => Array.isArray(item?.scopeMetadata) ? item.scopeMetadata : [])
  const models = [...new Set(scopes
    .map((scope: any) => normalizeScopeModel(scope?.vehicleModel))
    .filter((model) => model && model !== 'all'))]
  const years = [...new Set(scopes.flatMap((scope: any) => [scope.modelYearFrom, scope.modelYearTo]
    .filter((year: unknown): year is number => Number.isInteger(year))))]
  return models.length === 1 && years.length > 1 && models[0] === normalizeScopeModel(rawModel)
    ? rawModel
    : undefined
}

function selectKnowledgeScope(
  items: any[],
  vehicleModel: string | undefined,
  modelYear: number | undefined,
  catalogDefaultYear?: number,
): { items: any[]; defaultedModelYear?: number } {
  // Knowledge retrieval is not a sales catalog. Never choose the largest year
  // merely because it exists; only a single active/effective year is safe to
  // resolve automatically. Multiple years remain an explicit clarification.
  if (!vehicleModel || modelYear != null) {
    return { items }
  }

  if (catalogDefaultYear != null) return { items, defaultedModelYear: catalogDefaultYear }

  const targetModel = normalizeScopeModel(vehicleModel)
  const scopes = items.flatMap((item) => Array.isArray(item?.scopeMetadata) ? item.scopeMetadata : [])
    .filter((scope: any) => {
      const scopeModel = normalizeScopeModel(scope?.vehicleModel)
      return scopeModel && scopeModel !== 'all' && scopeModel === targetModel
    })
  const years = [...new Set(scopes.flatMap((scope: any) => [scope.modelYearFrom, scope.modelYearTo]
    .filter((year: unknown): year is number => Number.isInteger(year))))]
    .sort((left, right) => right - left)

  if (years.length === 1) return { items, defaultedModelYear: years[0] }

  return { items, defaultedModelYear: undefined }
}

function applyKnowledgeScope(
  result: ToolResult,
  scope: KnowledgeScopeBinding | null | undefined,
  input: SearchKnowledgeInput,
  resolution: KnowledgeScopeResolution = {},
): ToolResult {
  const ignoredRawFields = [
    input.vehicleModel ? 'vehicleModel' : undefined,
    input.modelYear != null ? 'modelYear' : undefined,
  ].filter((field): field is string => Boolean(field))

  if (!scope && ignoredRawFields.length === 0) return result

  const appliedBindings: AppliedBinding[] = []
  if (scope?.vehicleModel) {
    appliedBindings.push({
      field: 'vehicleModel',
      value: scope.vehicleModel,
      authority: 'ENFORCED',
      provenance: { kind: 'SERVER_RESOLVED', id: scope.bindingId },
    })
  }
  if (scope?.modelYear != null) {
    appliedBindings.push({
      field: 'modelYear',
      value: scope.modelYear,
      authority: 'ENFORCED',
      provenance: { kind: 'SERVER_RESOLVED', id: scope.bindingId },
    })
  }

  return {
    ...result,
    appliedBindings: [...result.appliedBindings, ...appliedBindings],
    diagnostics: {
      ...result.diagnostics,
      scope: {
        bindingId: scope?.bindingId,
        vehicleModel: scope?.vehicleModel,
        modelYear: scope?.modelYear,
        defaultedModelYear: resolution.defaultedModelYear,
        yearPolicy: scope?.modelYear != null
          ? 'EXPLICIT'
          : resolution.defaultedModelYear != null
            ? 'ONLY_AVAILABLE'
            : undefined,
        catalogStatus: resolution.catalog?.status,
        catalogEntryCount: resolution.catalog?.entries.length,
        catalogEpoch: resolution.catalog?.knowledgeEpoch,
        sources: scope?.sources
          ? Object.fromEntries(Object.entries(scope.sources).map(([key, value]) => [key, value]))
          : undefined,
        ignoredRawFields: ignoredRawFields.length > 0 ? ignoredRawFields : undefined,
      },
    },
  }
}

export async function executeDataTool(
  name: DataToolName,
  args: any,
  toolCallId: string,
  options: ExecuteDataToolOptions = {},
): Promise<ToolResult> {
  const readAt = new Date().toISOString()
  const dataAsOf = readAt

  try {
    switch (name) {
      case 'browse_catalog':
        return await browseCatalogRepository(args as BrowseCatalogInput, toolCallId)

      case 'get_product_details':
        return await getProductDetailsRepository(args as GetProductDetailsInput, toolCallId)

      case 'compare_products':
        return await compareProductsRepository(args as any, toolCallId)

      case 'get_current_promotions':
        return await getCurrentPromotionsRepository(args as GetCurrentPromotionsInput, toolCallId)

      case 'discover_accessories': {
        const input = args as DiscoverAccessoriesInput
        const vehicleId = input.mode.kind === 'FOR_PRODUCT' ? input.mode.productId : undefined
        const res = await discoverSalesAgentAccessories({
          vehicleProductId: vehicleId,
          minPrice: input.price?.min,
          maxPrice: input.price?.max,
          limit: input.page?.limit ?? 6,
        })

        const evidence: EvidenceRecord[] = res.items.map((acc: any) => ({
          evidenceId: `ev-acc-${acc.productId}-${readAt}`,
          source: { system: 'SUPABASE', resource: 'accessories' },
          entity: { kind: 'PRODUCT', id: acc.productId },
          facts: [
            { factRef: `fact-price-${acc.productId}`, factPath: 'price', valueHash: String(acc.price) },
            { factRef: `fact-name-${acc.productId}`, factPath: 'name', valueHash: acc.name },
          ],
          readAt,
          sourceUpdatedAt: acc.sourceUpdatedAt ?? undefined,
        }))

        const observation: ToolObservationRef = {
          observationId: `obs-${toolCallId}`,
          toolCallId,
          outcome: res.items.length > 0 ? 'SUCCESS' : 'NO_MATCH',
          issueCodes: [],
          inputHash: JSON.stringify(input),
          readAt,
        }

        return {
          schemaVersion: '2.0',
          toolCallId,
          tool: 'discover_accessories',
          readAt,
          dataAsOf,
          evidence,
          observation,
          issues: [],
          appliedBindings: [],
          outcome: res.items.length > 0 ? 'SUCCESS' : 'NO_MATCH',
          completeness: 'FULL',
          data: {
            items: res.items,
          },
        }
      }

      case 'search_knowledge': {
        const input = args as SearchKnowledgeInput
        // The model can suggest these fields, but only the server-derived scope
        // may become a retrieval filter or an ambiguity exemption.
        const inferredModel = options.knowledgeScope?.vehicleModel
        const inferredYear = options.knowledgeScope?.modelYear
        const shouldResolveCatalogYear = inferredModel && inferredYear == null
        const scopeCatalog = shouldResolveCatalogYear
          ? await loadKnowledgeScopeCatalog()
          : undefined
        const catalogYears = shouldResolveCatalogYear && inferredModel && scopeCatalog?.status === 'READY'
          ? knowledgeScopeCatalogEngine.getAvailableYearsForModel(inferredModel)
          : []
        const catalogDefaultYear = catalogYears.length === 1
          ? catalogYears[0]
          : undefined

        let retrieval: any
        try {
          const retrievalFilters = {
            ...(inferredModel ? { vehicleModel: inferredModel } : {}),
            ...((inferredYear ?? catalogDefaultYear) != null ? { modelYear: inferredYear ?? catalogDefaultYear } : {}),
            ...(input.categories && input.categories.length === 1
              ? { category: input.categories[0] as any }
              : {}),
          }
          retrieval = await new HybridHierarchicalRetrievalService({
            client: getSupabaseAdmin(),
          }).retrieve(
            input.query,
            retrievalFilters,
            {
              retrievalMode: 'HYBRID_HIERARCHICAL',
              topK: input.topK ?? 5,
            },
          )
        } catch (retrievalErr: any) {
          console.warn('[KNOWLEDGE RETRIEVAL] Search unavailable:', retrievalErr?.message || retrievalErr)
          retrieval = { status: 'UNAVAILABLE', items: [] }
        }

        if (retrieval.status === 'UNAVAILABLE' || !Array.isArray(retrieval.items)) {
          return applyKnowledgeScope({
            schemaVersion: '2.0',
            toolCallId,
            tool: 'search_knowledge',
            readAt,
            dataAsOf,
            evidence: [],
            observation: {
              observationId: `obs-${toolCallId}`,
              toolCallId,
              outcome: 'UNAVAILABLE',
              issueCodes: ['RESOURCE_UNAVAILABLE'],
              inputHash: JSON.stringify(input),
              readAt,
            },
            issues: [{ code: 'RESOURCE_UNAVAILABLE', message: 'Kho tài liệu tạm thời chưa phản hồi.' }],
            appliedBindings: [],
            outcome: 'UNAVAILABLE',
            diagnostics: {
              retrieval: {
                status: retrieval.status,
                retrievalMode: retrieval.retrievalMode,
                totalFound: retrieval.totalFound,
                ...retrieval.telemetry,
              },
            },
            data: null,
          }, options.knowledgeScope, input)
        }

        const selectedScope = selectKnowledgeScope(
          retrieval.items,
          inferredModel,
          inferredYear,
          catalogDefaultYear,
        )
        const scopeResolution: KnowledgeScopeResolution = {
          defaultedModelYear: selectedScope.defaultedModelYear,
          catalog: scopeCatalog
            ? {
                status: scopeCatalog.status,
                entries: scopeCatalog.entries,
                knowledgeEpoch: scopeCatalog.knowledgeEpoch,
              }
            : undefined,
        }
        const searchResults = selectedScope.items
        const effectiveModelYear = inferredYear ?? scopeResolution.defaultedModelYear
        const safeSearchResults = searchResults.map((item: any) => {
          const title = guardUntrustedKnowledgeText(item.title)
          const sectionTitle = guardUntrustedKnowledgeText(item.sectionTitle)
          const content = guardUntrustedKnowledgeText(item.content)
          return {
            ...item,
            title: title.text || 'Tài liệu FASTLANE',
            sectionTitle: sectionTitle.text || 'Nội dung tham chiếu',
            content: content.text,
            contentSafety: title.blocked || sectionTitle.blocked || content.blocked ? 'BLOCKED' : 'SAFE',
          }
        })
        const ambiguityModelHint = !inferredModel
          ? rawModelHintForYearAmbiguity(input.vehicleModel, safeSearchResults)
          : undefined
        const ambiguity = detectKnowledgeAmbiguity(safeSearchResults, {
          vehicleModel: inferredModel ?? ambiguityModelHint,
          modelYear: effectiveModelYear,
        }, {
          requireModel: !inferredModel && !ambiguityModelHint,
        })
        if (ambiguity) {
          const issues = [{
            code: 'AMBIGUOUS_REFERENCE' as const,
            message: ambiguity.question,
            field: ambiguity.field,
            candidates: ambiguity.candidates,
          }]
          return applyKnowledgeScope({
            schemaVersion: '2.0',
            toolCallId,
            tool: 'search_knowledge',
            readAt,
            dataAsOf,
            evidence: [],
            observation: {
              observationId: `obs-${toolCallId}`,
              toolCallId,
              outcome: 'NEEDS_INPUT',
              issueCodes: ['AMBIGUOUS_REFERENCE'],
              inputHash: JSON.stringify(input),
              readAt,
            },
            issues,
            appliedBindings: [],
            outcome: 'NEEDS_INPUT',
            diagnostics: {
              retrieval: {
                status: retrieval.status,
                retrievalMode: retrieval.retrievalMode,
                totalFound: retrieval.totalFound,
                ...retrieval.telemetry,
              },
            },
            data: ambiguity,
          }, options.knowledgeScope, input, scopeResolution)
        }
        let visualPointers: KnowledgeVisualMediaPointer[] = []
        const visualLookupEnabled = isSalesAgentVisualKnowledgeRetrievalEnabled()
        const visualLookupStartedAt = performance.now()
        if (visualLookupEnabled) {
          try {
            visualPointers = await findApprovedVisualKnowledge(
              getSupabaseAdmin(),
              input.query,
              searchResults,
              3,
            )
          } catch (visualError: any) {
            // Visuals are optional enrichment. Preserve the grounded text result
            // while keeping the separate visual release gate fail-closed.
            console.warn('[VISUAL KNOWLEDGE] Approved media lookup unavailable:', visualError?.message || visualError)
          }
        }
        const visualLookupLatencyMs = Math.max(0, Math.round((performance.now() - visualLookupStartedAt) * 100) / 100)

        const evidence: EvidenceRecord[] = safeSearchResults.map((k: any) => {
          const media = visualPointers.filter((pointer) => pointer.citationId === k.citationId)
          return {
            evidenceId: `ev-kb-${k.chunkId}-${readAt}`,
            source: { system: 'SUPABASE', resource: 'knowledge_chunks' },
            entity: { kind: 'KNOWLEDGE_SNIPPET', id: k.chunkId },
            facts: [
              { factRef: `fact-kb-title-${k.chunkId}`, factPath: 'title', valueHash: k.title },
              { factRef: `fact-kb-section-${k.chunkId}`, factPath: 'section', valueHash: k.sectionTitle },
              { factRef: `fact-kb-content-${k.chunkId}`, factPath: 'content', valueHash: k.content },
              { factRef: `fact-kb-citation-${k.chunkId}`, factPath: 'citationId', valueHash: k.citationId },
              { factRef: `fact-kb-evidence-ref-${k.chunkId}`, factPath: 'evidenceRef', valueHash: k.evidenceRef },
              ...media.map((pointer) => ({
                factRef: `fact-kb-media-${k.chunkId}-${pointer.assetId}`,
                factPath: 'mediaPointer',
                valueHash: JSON.stringify(pointer),
              })),
            ],
            readAt,
          }
        })

        const observation: ToolObservationRef = {
          observationId: `obs-${toolCallId}`,
          toolCallId,
          outcome: searchResults.length > 0 ? 'SUCCESS' : 'NO_MATCH',
          issueCodes: [],
          inputHash: JSON.stringify(input),
          readAt,
        }

        return applyKnowledgeScope({
          schemaVersion: '2.0',
          toolCallId,
          tool: 'search_knowledge',
          readAt,
          dataAsOf,
          evidence,
          observation,
          issues: [],
          appliedBindings: [],
          outcome: searchResults.length > 0 ? 'SUCCESS' : 'NO_MATCH',
          completeness: 'FULL',
          diagnostics: {
            retrieval: {
              status: retrieval.status,
              retrievalMode: retrieval.retrievalMode,
              totalFound: retrieval.totalFound,
              ...retrieval.telemetry,
            },
            visualLookup: {
              enabled: visualLookupEnabled,
              latencyMs: visualLookupLatencyMs,
              pointerCount: visualPointers.length,
            },
          },
          data: {
            snippets: safeSearchResults.map((r: any) => ({
              id: r.chunkId,
              documentSlug: r.documentKey,
              title: `${r.title} - ${r.sectionTitle}`,
              content: r.content,
              category: r.category ?? 'TECHNICAL_GUIDE',
              citationPointer: r.citationId,
              contentSafety: r.contentSafety,
              scopeMetadata: r.scopeMetadata,
              media: visualPointers.filter((pointer) => pointer.citationId === r.citationId),
            })),
          },
        }, options.knowledgeScope, input, scopeResolution)
      }

      default: {
        const exhaustiveCheck: never = name
        throw new Error(`Tool không được hỗ trợ: ${exhaustiveCheck}`)
      }
    }
  } catch (err: any) {
    console.warn(`[DATA TOOL RESILIENCE] Tool ${name} encountered an error:`, err?.message || err)
    const observation: ToolObservationRef = {
      observationId: `obs-err-${toolCallId}`,
      toolCallId,
      outcome: 'UNAVAILABLE',
      issueCodes: ['RESOURCE_UNAVAILABLE'],
      inputHash: JSON.stringify(args),
      readAt,
    }
    return {
      schemaVersion: '2.0',
      toolCallId,
      tool: name,
      readAt,
      dataAsOf,
      evidence: [],
      observation,
      issues: [{ code: 'RESOURCE_UNAVAILABLE', message: 'Dữ liệu tạm thời chưa phản hồi.' }],
      appliedBindings: [],
      outcome: 'UNAVAILABLE',
      data: null,
    }
  }
}
