import type { KnowledgeEvidenceItem, KnowledgeScopeMetadata } from './retrieval/contracts'

export type KnowledgeAmbiguity = {
  field: 'vehicleModel' | 'modelYear'
  question: string
  candidates: Array<{
    vehicleModel?: string
    modelYearFrom?: number
    modelYearTo?: number
    label: string
  }>
  matchedScopes: KnowledgeScopeMetadata[]
}

export type KnowledgeAmbiguityOptions = {
  /** Require an explicit user/server model even when retrieval found one model. */
  requireModel?: boolean
}

function normalizeModel(value: string | null | undefined) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function concreteScopes(items: KnowledgeEvidenceItem[]) {
  const scopes = items.flatMap((item) => item.scopeMetadata ?? [])
  const seen = new Set<string>()
  return scopes.filter((scope) => {
    const key = [
      normalizeModel(scope.vehicleModel),
      scope.modelYearFrom ?? '',
      scope.modelYearTo ?? '',
      scope.market ?? '',
    ].join(':')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function yearLabel(scope: KnowledgeScopeMetadata) {
  const from = scope.modelYearFrom ?? undefined
  const to = scope.modelYearTo ?? undefined
  if (!from && !to) return null
  if (!from || !to || from === to) return String(from ?? to)
  return `${from}-${to}`
}

export function detectKnowledgeAmbiguity(
  items: KnowledgeEvidenceItem[],
  requested: { vehicleModel?: string; modelYear?: number },
  options: KnowledgeAmbiguityOptions = {},
): KnowledgeAmbiguity | null {
  const scopes = concreteScopes(items)
  if (scopes.length === 0) return null

  const models = [...new Map(scopes.flatMap((scope) => {
    const model = scope.vehicleModel?.trim()
    if (!model || model.toUpperCase() === 'ALL') return []
    return [[normalizeModel(model), model] as const]
  })).values()]

  if (!requested.vehicleModel && (models.length > 1 || (options.requireModel && models.length > 0))) {
    return {
      field: 'vehicleModel',
      question: `Bạn đang hỏi mẫu xe nào: ${models.join(', ')}?`,
      candidates: models.map((vehicleModel) => ({ vehicleModel, label: vehicleModel })),
      matchedScopes: scopes,
    }
  }

  if (requested.modelYear) return null

  const targetModel = normalizeModel(requested.vehicleModel || (models.length === 1 ? models[0] : ''))
  const relevantScopes = targetModel
    ? scopes.filter((scope) => normalizeModel(scope.vehicleModel) === targetModel)
    : scopes
  const distinctYears = new Map<string, KnowledgeScopeMetadata>()
  for (const scope of relevantScopes) {
    const label = yearLabel(scope)
    if (label) distinctYears.set(label, scope)
  }

  if (distinctYears.size > 1) {
    const vehicleModel = requested.vehicleModel || (models.length === 1 ? models[0] : undefined)
    const candidates = [...distinctYears.entries()].map(([label, scope]) => ({
      ...(vehicleModel ? { vehicleModel } : {}),
      ...(scope.modelYearFrom ? { modelYearFrom: scope.modelYearFrom } : {}),
      ...(scope.modelYearTo ? { modelYearTo: scope.modelYearTo } : {}),
      label: vehicleModel ? `${vehicleModel} ${label}` : label,
    }))
    return {
      field: 'modelYear',
      question: `Xe của bạn thuộc đời nào: ${candidates.map((candidate) => candidate.label).join(', ')}?`,
      candidates,
      matchedScopes: relevantScopes,
    }
  }

  return null
}
