import type { DataToolName } from '../contracts'
import type { RequiredAfterSalesLookup } from './after-sales-intent'

type RequiredToolContext = {
  userText: string
  afterSalesLookup: RequiredAfterSalesLookup | null
  manualLookup: boolean
  warrantyKnowledgeLookup: boolean
}

function normalizeVietnamese(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function inferVehicleType(text: string): 'car' | 'motorbike' | undefined {
  const normalized = normalizeVietnamese(text)
  if (/\b(?:xe may|motorbike|evo|feliz|klara|vento|theon|drgnfly|motio|amio|kinet)\b/.test(normalized)) {
    return 'motorbike'
  }
  if (/\b(?:o to|car|vf\s*(?:e?\d+)|fadil|lux|president|lac hong|ec van|\w+ green)\b/.test(normalized)) {
    return 'car'
  }
  return undefined
}

function inferModelSeries(text: string): string | undefined {
  const normalized = normalizeVietnamese(text)
  const vfMatch = normalized.match(/\bvf\s*(e?\d+)\b/)
  return vfMatch ? `VF ${vfMatch[1].toUpperCase()}` : undefined
}

function inferYear(text: string): number | undefined {
  const match = text.match(/\b(20\d{2})\b/)
  return match ? Number(match[1]) : undefined
}

function inferProvince(text: string): string | undefined {
  const normalized = normalizeVietnamese(text)
  if (/\b(?:tp hcm|tphcm|hcm|sai gon|ho chi minh)\b/.test(normalized)) return 'Hồ Chí Minh'
  if (/\b(?:ha noi|hn)\b/.test(normalized)) return 'Hà Nội'
  return undefined
}

function keepUserSuppliedAdministrativeFilter(value: unknown, userText: string): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  return normalizeVietnamese(userText).includes(normalizeVietnamese(value)) ? value.trim() : undefined
}

export function canonicalizeRequiredToolInput(
  toolName: DataToolName,
  rawInput: unknown,
  context: RequiredToolContext,
): Record<string, unknown> {
  const input = rawInput && typeof rawInput === 'object' ? { ...(rawInput as Record<string, unknown>) } : {}
  const vehicleType = inferVehicleType(context.userText)

  if (toolName === 'search_after_sales' && context.afterSalesLookup?.toolName === 'search_after_sales') {
    return {
      ...input,
      serviceType: context.afterSalesLookup.serviceType,
      query: context.userText,
      ...(vehicleType ? { vehicleType } : {}),
      ...(inferModelSeries(context.userText) ? { model: inferModelSeries(context.userText) } : {}),
    }
  }

  if (toolName === 'find_service_locations' && context.afterSalesLookup?.toolName === 'find_service_locations') {
    const province = inferProvince(context.userText)
      ?? keepUserSuppliedAdministrativeFilter(input.province, context.userText)
    const district = keepUserSuppliedAdministrativeFilter(input.district, context.userText)
    return {
      ...input,
      query: context.userText,
      limit: Math.max(typeof input.limit === 'number' ? input.limit : 8, 8),
      ...(vehicleType ? { vehicleType } : {}),
      ...(vehicleType === 'motorbike' ? { category: 'electric_motorbike_workshop' } : {}),
      province,
      district,
    }
  }

  if (toolName === 'search_user_manuals' && context.manualLookup) {
    return {
      ...input,
      query: context.userText,
      ...(inferModelSeries(context.userText) ? { modelSeries: inferModelSeries(context.userText) } : {}),
      ...(inferYear(context.userText) ? { year: inferYear(context.userText) } : {}),
    }
  }

  if (toolName === 'search_knowledge' && context.warrantyKnowledgeLookup) {
    return { ...input, query: context.userText }
  }

  return input
}
