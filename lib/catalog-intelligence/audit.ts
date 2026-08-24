import { CORE_SPEC_ALIASES, CORE_SPEC_DEFINITIONS } from './definitions'
import { extractProductSpecifications } from './extractors'
import { SpecRegistry } from './registry'
import { resolveRawSpec } from './resolver'
import type { CatalogProductInput, SpecResolution } from './types'

export type CatalogAuditProduct = {
  productId: string
  productName: string
  rawCount: number
  resolvedCount: number
  unknownCount: number
  ambiguousCount: number
  invalidCount: number
  warningCodes: string[]
  resolvedKeys: string[]
  issues: Array<{ sourcePath: string; rawKey: string; rawValue: unknown; status: Exclude<SpecResolution['status'], 'RESOLVED'>; detail?: string }>
}

export type CatalogAuditReport = {
  mode: 'DRY_RUN'
  products: number
  rawObservations: number
  resolved: number
  unknown: number
  ambiguous: number
  invalid: number
  extractionWarnings: number
  writes: 0
  byCanonicalKey: Record<string, number>
  productReports: CatalogAuditProduct[]
}

export function auditCatalogProducts(
  products: readonly CatalogProductInput[],
  registry = new SpecRegistry(CORE_SPEC_DEFINITIONS, CORE_SPEC_ALIASES),
): CatalogAuditReport {
  const productReports = [...products]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((product): CatalogAuditProduct => {
      const extraction = extractProductSpecifications(product)
      const resolvedKeys = new Set<string>()
      const issues: CatalogAuditProduct['issues'] = []
      let resolvedCount = 0
      let unknownCount = 0
      let ambiguousCount = 0
      let invalidCount = 0

      for (const raw of extraction.observations) {
        const resolution = resolveRawSpec(raw, registry)
        if (resolution.status === 'RESOLVED') {
          resolvedCount += 1
          resolvedKeys.add(resolution.definition.canonicalKey)
        } else {
          if (resolution.status === 'UNKNOWN_SPEC') unknownCount += 1
          if (resolution.status === 'AMBIGUOUS') ambiguousCount += 1
          if (resolution.status === 'INVALID_VALUE') invalidCount += 1
          issues.push({
            sourcePath: raw.sourcePath,
            rawKey: raw.rawKey,
            rawValue: raw.rawValue,
            status: resolution.status,
            detail: resolution.status === 'INVALID_VALUE'
              ? resolution.reason
              : resolution.status === 'AMBIGUOUS'
                ? resolution.candidateKeys.join(', ')
                : undefined,
          })
        }
      }

      return {
        productId: product.id,
        productName: product.name,
        rawCount: extraction.observations.length,
        resolvedCount,
        unknownCount,
        ambiguousCount,
        invalidCount,
        warningCodes: extraction.warnings.map((warning) => warning.code).sort(),
        resolvedKeys: [...resolvedKeys].sort(),
        issues: issues.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath)),
      }
    })

  const byCanonicalKey: Record<string, number> = {}
  for (const report of productReports) {
    for (const key of report.resolvedKeys) byCanonicalKey[key] = (byCanonicalKey[key] ?? 0) + 1
  }

  return {
    mode: 'DRY_RUN',
    products: productReports.length,
    rawObservations: productReports.reduce((sum, item) => sum + item.rawCount, 0),
    resolved: productReports.reduce((sum, item) => sum + item.resolvedCount, 0),
    unknown: productReports.reduce((sum, item) => sum + item.unknownCount, 0),
    ambiguous: productReports.reduce((sum, item) => sum + item.ambiguousCount, 0),
    invalid: productReports.reduce((sum, item) => sum + item.invalidCount, 0),
    extractionWarnings: productReports.reduce((sum, item) => sum + item.warningCodes.length, 0),
    writes: 0,
    byCanonicalKey: Object.fromEntries(Object.entries(byCanonicalKey).sort(([left], [right]) => left.localeCompare(right))),
    productReports,
  }
}
