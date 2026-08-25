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
  signal?: AbortSignal
}

type KnowledgeScopeResolution = {
  defaultedModelYear?: number
  catalogModel?: string
  catalog?: Pick<KnowledgeScopeCatalogSnapshot, 'status' | 'entries' | 'knowledgeEpoch'>
}

async function loadKnowledgeScopeCatalog(_signal?: AbortSignal): Promise<KnowledgeScopeCatalogSnapshot> {
  // Serve verified or seeded inventory immediately while background refresh runs.
  const cachedSnapshot = knowledgeScopeCatalogEngine.getSnapshot()
  if (cachedSnapshot.entries.length > 0) return cachedSnapshot
  return knowledgeScopeCatalogEngine.getSnapshotAsync()
}

function normalizeScopeModel(value: unknown) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

type ScopeClarificationField = {
  field: 'vehicleModel' | 'modelYear'
  label: string
  required: boolean
  dependsOn?: 'vehicleModel'
  options: Array<{
    optionId: string
    label: string
    field: 'vehicleModel' | 'modelYear'
    value: string
    metadata?: Record<string, string | number | boolean>
  }>
}

type ScopeClarification = {
  kind: 'KNOWLEDGE_SCOPE'
  field: 'vehicleModel' | 'modelYear'
  question: string
  candidates: Array<{ vehicleModel?: string; modelYear?: number; label: string }>
  fields: ScopeClarificationField[]
  matchedScopes: []
}

function isSalesKnowledgeCategory(category: string | undefined) {
  return category === 'PROMOTIONS_FINANCING'
    || category === 'PURCHASE_POLICY'
    || category === 'DEPOSIT_DELIVERY'
    || category === 'REGISTRATION_PROCEDURE'
    || category === 'WARRANTY_BATTERY'
    || category === 'CHARGING_NETWORK'
    || category === 'GENERAL_POLICY'
}

function isPolicySearchQuery(query: string | undefined): boolean {
  if (!query) return false
  return /(bảo hành|chính sách|đặt cọc|nhận xe|bàn giao|trạm sạc|thuê pin|trả góp|ưu đãi|khuyến mãi|thanh toán|hợp đồng)/i.test(query)
}

function buildVehicleModelClarification(
  catalog: KnowledgeScopeCatalogSnapshot | undefined,
  input: SearchKnowledgeInput,
): ScopeClarification | null {
  if (!catalog || catalog.status !== 'READY') return null
  if (!input.query?.trim()) return null
  if (input.categories?.length && input.categories.every(isSalesKnowledgeCategory)) return null
  if (isPolicySearchQuery(input.query)) return null

  const models = [...new Map(
    catalog.entries
      .map((entry) => entry.vehicleModel?.trim())
      .filter((model): model is string => Boolean(model))
      .map((model) => [normalizeScopeModel(model), model] as const),
  ).values()].slice(0, 64)

  if (models.length <= 1) return null

  const modelOptions = models.map((vehicleModel, index) => ({
    optionId: `scope-model-${index + 1}`,
    label: vehicleModel,
    field: 'vehicleModel' as const,
    value: vehicleModel,
  }))
  const technicalRequest = true
  const yearsByModel = new Map(models.map((model) => {
    const years = [...new Set(catalog.entries
      .filter((entry) => normalizeScopeModel(entry.vehicleModel) === normalizeScopeModel(model))
      .flatMap((entry) => [entry.modelYearFrom, entry.modelYearTo])
      .filter((year): year is number => Number.isInteger(year)))].sort((a, b) => a - b)
    return [model, years] as const
  }))
  const hasMultipleYears = technicalRequest && [...yearsByModel.values()].some((years) => years.length > 1)
  const yearOptions = hasMultipleYears
    ? [...yearsByModel.entries()].flatMap(([model, years]) => years.map((year) => ({
        optionId: `scope-year-${normalizeScopeModel(model)}-${year}`,
        label: `${year} — ${model}`,
        field: 'modelYear' as const,
        value: String(year),
        metadata: { vehicleModel: model },
      }))).slice(0, 64)
    : []

  return {
    kind: 'KNOWLEDGE_SCOPE',
    field: 'vehicleModel',
    question: `Bạn đang hỏi dòng xe nào: ${models.join(', ')}?`,
    candidates: models.map((vehicleModel) => ({ vehicleModel, label: vehicleModel })),
    fields: [
      { field: 'vehicleModel', label: 'Dòng xe', required: true, options: modelOptions },
      ...(yearOptions.length > 0
        ? [{ field: 'modelYear' as const, label: 'Năm áp dụng', required: true, dependsOn: 'vehicleModel' as const, options: yearOptions }]
        : []),
    ],
    matchedScopes: [],
  }
}

function buildModelYearClarification(
  catalog: KnowledgeScopeCatalogSnapshot | undefined,
  vehicleModel: string | undefined,
  input: SearchKnowledgeInput,
): ScopeClarification | null {
  if (!catalog || catalog.status !== 'READY' || !vehicleModel) return null
  if (input.categories?.length && input.categories.every(isSalesKnowledgeCategory)) return null
  if (isPolicySearchQuery(input.query)) return null
  const years = [...new Set(catalog.entries
    .filter((entry) => normalizeScopeModel(entry.vehicleModel) === normalizeScopeModel(vehicleModel))
    .flatMap((entry) => [entry.modelYearFrom, entry.modelYearTo])
    .filter((year): year is number => Number.isInteger(year)))].sort((a, b) => a - b)
  if (years.length <= 1) return null
  const options = years.slice(0, 64).map((year, index) => ({
    optionId: `scope-year-${normalizeScopeModel(vehicleModel)}-${year}-${index + 1}`,
    label: String(year),
    field: 'modelYear' as const,
    value: String(year),
    metadata: { vehicleModel },
  }))
  return {
    kind: 'KNOWLEDGE_SCOPE',
    field: 'modelYear',
    question: `Bạn muốn xem thông tin ${vehicleModel} đời nào?`,
    candidates: years.map((modelYear) => ({ modelYear, label: String(modelYear) })),
    fields: [
      {
        field: 'vehicleModel',
        label: 'Dòng xe',
        required: true,
        options: [{ optionId: `scope-model-${normalizeScopeModel(vehicleModel)}`, label: vehicleModel, field: 'vehicleModel', value: vehicleModel }],
      },
      { field: 'modelYear', label: 'Năm áp dụng', required: true, dependsOn: 'vehicleModel', options },
    ],
    matchedScopes: [],
  }
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

  if (!scope && ignoredRawFields.length === 0 && !resolution.catalog && !resolution.catalogModel) return result

  const appliedBindings: AppliedBinding[] = []
  if (scope?.vehicleModel) {
    appliedBindings.push({
      field: 'vehicleModel',
      value: scope.vehicleModel,
      authority: 'ENFORCED',
      provenance: { kind: 'SERVER_RESOLVED', id: scope.bindingId },
    })
  } else if (resolution.catalogModel) {
    appliedBindings.push({
      field: 'vehicleModel',
      value: resolution.catalogModel,
      authority: 'ENFORCED',
      provenance: { kind: 'SERVER_RESOLVED', id: `scope-catalog-${normalizeScopeModel(resolution.catalogModel)}` },
    })
  }
  if (scope?.modelYear != null) {
    appliedBindings.push({
      field: 'modelYear',
      value: scope.modelYear,
      authority: 'ENFORCED',
      provenance: { kind: 'SERVER_RESOLVED', id: scope.bindingId },
    })
  } else if (resolution.defaultedModelYear != null) {
    appliedBindings.push({
      field: 'modelYear',
      value: resolution.defaultedModelYear,
      authority: 'ENFORCED',
      provenance: {
        kind: 'SERVER_RESOLVED',
        id: scope?.bindingId || (resolution.catalogModel ? `scope-catalog-${normalizeScopeModel(resolution.catalogModel)}` : undefined),
      },
    })
  }

  return {
    ...result,
    appliedBindings: [...result.appliedBindings, ...appliedBindings],
    diagnostics: {
      ...result.diagnostics,
      scope: {
        bindingId: scope?.bindingId || (resolution.catalogModel ? `scope-catalog-${normalizeScopeModel(resolution.catalogModel)}` : undefined),
        vehicleModel: scope?.vehicleModel ?? resolution.catalogModel,
        modelYear: scope?.modelYear,
        defaultedModelYear: resolution.defaultedModelYear,
        yearPolicy: scope?.modelYearPolicy
          ?? (scope?.modelYear != null
            ? 'EXPLICIT'
            : resolution.defaultedModelYear != null
              ? (input.categories?.length && input.categories.every(isSalesKnowledgeCategory) ? 'LATEST' : 'ONLY_AVAILABLE')
              : undefined),
        catalogStatus: resolution.catalog?.status,
        catalogEntryCount: resolution.catalog?.entries.length,
        catalogEpoch: resolution.catalog?.knowledgeEpoch,
        sources: scope?.sources
          ? Object.fromEntries(Object.entries(scope.sources).map(([key, value]) => [key, value]))
          : resolution.catalogModel
            ? { vehicleModel: 'CATALOG' }
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
  const toolStartedAt = Date.now()
  let executionPhase = `dispatch:${name}`

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
        executionPhase = 'knowledge_scope_and_retrieval'
        const input = args as SearchKnowledgeInput
        // The model can suggest these fields, but only the server-derived scope
        // may become a retrieval filter or an ambiguity exemption.
        const inferredModel = options.knowledgeScope?.vehicleModel
        const inferredYear = options.knowledgeScope?.modelYear
        let scopeCatalog = (!inferredModel || inferredYear == null)
          ? await loadKnowledgeScopeCatalog(options.signal)
          : undefined
        const catalogModels = !inferredModel && scopeCatalog?.status === 'READY'
          ? [...new Map(scopeCatalog.entries
              .map((entry) => entry.vehicleModel?.trim())
              .filter((model): model is string => Boolean(model))
              .map((model) => [normalizeScopeModel(model), model] as const)).values()]
          : []
        const catalogModel = catalogModels.length === 1 ? catalogModels[0] : undefined
        const resolvedModel = inferredModel ?? catalogModel
        const shouldResolveCatalogYear = resolvedModel && inferredYear == null
        const catalogYears = shouldResolveCatalogYear && resolvedModel && scopeCatalog?.status === 'READY'
          ? [...new Set(scopeCatalog.entries
              .filter((entry) => normalizeScopeModel(entry.vehicleModel) === normalizeScopeModel(resolvedModel))
              .flatMap((entry) => [entry.modelYearFrom, entry.modelYearTo])
              .filter((year): year is number => Number.isInteger(year)))].sort((a, b) => a - b)
          : []
        const signedYearPolicy = options.knowledgeScope?.modelYearPolicy
        const salesKnowledgeRequest = Boolean(input.categories?.length && input.categories.every(isSalesKnowledgeCategory))
        const catalogDefaultYear = catalogYears.length === 1
          ? catalogYears[0]
          : (signedYearPolicy === 'LATEST' || salesKnowledgeRequest) && catalogYears.length > 0
            ? Math.max(...catalogYears)
            : undefined

        // Do not run an unscoped vector search merely to discover that the
        // answer spans multiple vehicle lines. The scope catalog is a small,
        // server-owned inventory of effective knowledge scopes; when it says
        // the active knowledge is vehicle-specific and covers multiple lines,
        // ask the user before touching the expensive chunk retrieval path.
        const vehicleModelClarification = !inferredModel && !catalogModel
          ? buildVehicleModelClarification(scopeCatalog, input)
          : null
        const modelYearClarification = !vehicleModelClarification && !signedYearPolicy && shouldResolveCatalogYear && catalogYears.length > 1
          ? buildModelYearClarification(scopeCatalog, resolvedModel, input)
          : null
        const clarification = vehicleModelClarification || modelYearClarification
        if (clarification) {
          const issues = [{
            code: 'AMBIGUOUS_REFERENCE' as const,
            message: clarification.question,
            field: clarification.field,
            candidates: clarification.candidates,
          }]
          const scopeResolution: KnowledgeScopeResolution = {
            ...(catalogModel ? { catalogModel } : {}),
            catalog: scopeCatalog
              ? {
                  status: scopeCatalog.status,
                  entries: scopeCatalog.entries,
                  knowledgeEpoch: scopeCatalog.knowledgeEpoch,
                }
              : undefined,
          }
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
                status: 'SCOPE_PREFLIGHT',
                scopeCatalogStatus: scopeCatalog?.status,
                scopeCatalogEntryCount: scopeCatalog?.entries.length ?? 0,
                scopePreflightStatus: scopeCatalog?.status,
              },
            },
            data: clarification,
          }, options.knowledgeScope, input, scopeResolution)
        }

        let retrieval: any
        try {
          const retrievalFilters = {
            ...(resolvedModel ? { vehicleModel: resolvedModel } : {}),
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
              signal: options.signal,
            },
          )
        } catch (retrievalErr: any) {
          const failure = retrievalErr?.details
          console.warn('[KNOWLEDGE RETRIEVAL] Search unavailable:', {
            message: retrievalErr?.message || String(retrievalErr),
            failure,
          })
          retrieval = { status: 'UNAVAILABLE', items: [], failure }
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
                failure: retrieval.failure,
                scopePreflightStatus: scopeCatalog?.status,
                boundedGeneralRetrieval: !resolvedModel && (scopeCatalog?.status === 'UNAVAILABLE' || scopeCatalog?.status === 'EMPTY'),
              },
            },
            data: null,
          }, options.knowledgeScope, input)
        }

        // A cold catalog refresh continues after the bounded preflight wait.
        // Retrieval usually takes long enough for it to finish, so consult the
        // completed snapshot before deriving years from only the top-K chunks.
        if (scopeCatalog?.status !== 'READY') {
          const refreshedCatalog = knowledgeScopeCatalogEngine.getSnapshot()
          if (refreshedCatalog.status === 'READY' && refreshedCatalog.entries.length > 0) {
            scopeCatalog = refreshedCatalog
          }
        }
        if (!signedYearPolicy && resolvedModel && inferredYear == null && scopeCatalog?.status === 'READY') {
          const recoveredClarification = buildModelYearClarification(scopeCatalog, resolvedModel, input)
          if (recoveredClarification) {
            const issues = [{
              code: 'AMBIGUOUS_REFERENCE' as const,
              message: recoveredClarification.question,
              field: recoveredClarification.field,
              candidates: recoveredClarification.candidates,
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
                  scopePreflightStatus: 'READY',
                  scopePreflightRecovered: true,
                },
              },
              data: recoveredClarification,
            }, options.knowledgeScope, input, {
              catalog: {
                status: scopeCatalog.status,
                entries: scopeCatalog.entries,
                knowledgeEpoch: scopeCatalog.knowledgeEpoch,
              },
            })
          }
        }

        const selectedScope = selectKnowledgeScope(
          retrieval.items,
          resolvedModel,
          inferredYear,
          catalogDefaultYear,
        )
        const scopeResolution: KnowledgeScopeResolution = {
          defaultedModelYear: selectedScope.defaultedModelYear,
          ...(catalogModel ? { catalogModel } : {}),
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
        const ambiguity = detectKnowledgeAmbiguity(safeSearchResults, {
          vehicleModel: resolvedModel,
          modelYear: effectiveModelYear,
        }, {
          requireModel: !resolvedModel,
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
                scopePreflightStatus: scopeCatalog?.status,
                boundedGeneralRetrieval: !resolvedModel && (scopeCatalog?.status === 'UNAVAILABLE' || scopeCatalog?.status === 'EMPTY'),
              },
            },
            data: ambiguity,
          }, options.knowledgeScope, input, scopeResolution)
        }
        let visualPointers: KnowledgeVisualMediaPointer[] = []
        let visualLookupError: { name: string; message: string } | undefined
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
            visualLookupError = visualError instanceof Error
              ? { name: visualError.name, message: visualError.message }
              : { name: 'UNKNOWN_ERROR', message: String(visualError) }
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
              scopePreflightStatus: scopeCatalog?.status,
              boundedGeneralRetrieval: !resolvedModel && (scopeCatalog?.status === 'UNAVAILABLE' || scopeCatalog?.status === 'EMPTY'),
            },
            visualLookup: {
              enabled: visualLookupEnabled,
              latencyMs: visualLookupLatencyMs,
              pointerCount: visualPointers.length,
              status: visualLookupError ? 'UNAVAILABLE' : 'COMPLETED',
              error: visualLookupError,
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
    const error = err instanceof Error
      ? { name: err.name, message: err.message }
      : { name: 'UNKNOWN_ERROR', message: String(err) }
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
      diagnostics: {
        execution: {
          status: 'FAILED',
          phase: executionPhase,
          elapsedMs: Date.now() - toolStartedAt,
          error,
        },
      },
      data: null,
    }
  }
}
