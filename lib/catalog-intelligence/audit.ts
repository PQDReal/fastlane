import { CATALOG_SPEC_ALIASES, CATALOG_SPEC_DEFINITIONS } from './definitions'
import { extractProductSpecifications } from './extractors'
import { catalogInputHash, catalogSourceHash } from './hash'
import { SpecRegistry } from './registry'
import { resolveRawSpec } from './resolver'
import { sourceReviewBlockFor, type SourceReviewBlockReason } from './source-review'
import type { CatalogProductInput, SpecResolution } from './types'

export type CatalogAuditProduct = {
  productId: string
  productName: string
  inputHash: string
  sourceHash: string
  rawCount: number
  resolvedCount: number
  resolvedFactCount: number
  ignoredCount: number
  sourceConflictCount: number
  unknownCount: number
  ambiguousCount: number
  invalidCount: number
  warningCodes: string[]
  sourceReview: null | { reasonCode: SourceReviewBlockReason; reason: string; evidenceUrls: readonly string[]; reviewedAt: string }
  resolvedKeys: string[]
  issues: Array<{ sourcePath: string; rawKey: string; rawValue: unknown; status: Exclude<SpecResolution['status'], 'RESOLVED'>; detail?: string }>
}

export type CatalogAuditReport = {
  mode: 'DRY_RUN'
  products: number
  rawObservations: number
  resolved: number
  resolvedFacts: number
  ignored: number
  sourceConflicts: number
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
  registry = new SpecRegistry(CATALOG_SPEC_DEFINITIONS, CATALOG_SPEC_ALIASES),
): CatalogAuditReport {
  const productReports = [...products]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((product): CatalogAuditProduct => {
      const extraction = extractProductSpecifications(product)
      const sourceBlock = sourceReviewBlockFor(product)
      if (sourceBlock) {
        return {
          productId: product.id,
          productName: product.name,
          inputHash: catalogInputHash(product.specifications),
          sourceHash: sourceBlock.sourceHash,
          rawCount: extraction.observations.length,
          resolvedCount: 0,
          resolvedFactCount: 0,
          ignoredCount: 0,
          sourceConflictCount: extraction.observations.length,
          unknownCount: 0,
          ambiguousCount: 0,
          invalidCount: 0,
          warningCodes: extraction.warnings.map((warning) => warning.code).sort(),
          sourceReview: {
            reasonCode: sourceBlock.reasonCode,
            reason: sourceBlock.reason,
            evidenceUrls: sourceBlock.evidenceUrls,
            reviewedAt: sourceBlock.reviewedAt,
          },
          resolvedKeys: [],
          issues: [{
            sourcePath: '$snapshot',
            rawKey: '$sourceReview',
            rawValue: { sourceHash: sourceBlock.sourceHash, evidenceUrls: sourceBlock.evidenceUrls },
            status: 'SOURCE_CONFLICT',
            detail: `${sourceBlock.reasonCode}: ${sourceBlock.reason}`,
          }],
        }
      }
      const resolvedKeys = new Set<string>()
      const issues: CatalogAuditProduct['issues'] = []
      let resolvedCount = 0
      let resolvedFactCount = 0
      let ignoredCount = 0
      let unknownCount = 0
      let ambiguousCount = 0
      let invalidCount = 0

      for (const raw of extraction.observations) {
        const resolution = resolveRawSpec(raw, registry)
        if (resolution.status === 'RESOLVED') {
          resolvedCount += 1
          resolvedFactCount += resolution.facts.length
          resolvedKeys.add(resolution.definition.canonicalKey)
        } else {
          if (resolution.status === 'IGNORED') ignoredCount += 1
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
                : resolution.status === 'IGNORED'
                  ? `${resolution.reasonCode}: ${resolution.reason}`
                : undefined,
          })
        }
      }

      return {
        productId: product.id,
        productName: product.name,
        inputHash: catalogInputHash(product.specifications),
        sourceHash: catalogSourceHash(product.specifications),
        rawCount: extraction.observations.length,
        resolvedCount,
        resolvedFactCount,
        ignoredCount,
        sourceConflictCount: 0,
        unknownCount,
        ambiguousCount,
        invalidCount,
        warningCodes: extraction.warnings.map((warning) => warning.code).sort(),
        sourceReview: null,
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
    resolvedFacts: productReports.reduce((sum, item) => sum + item.resolvedFactCount, 0),
    ignored: productReports.reduce((sum, item) => sum + item.ignoredCount, 0),
    sourceConflicts: productReports.reduce((sum, item) => sum + item.sourceConflictCount, 0),
    unknown: productReports.reduce((sum, item) => sum + item.unknownCount, 0),
    ambiguous: productReports.reduce((sum, item) => sum + item.ambiguousCount, 0),
    invalid: productReports.reduce((sum, item) => sum + item.invalidCount, 0),
    extractionWarnings: productReports.reduce((sum, item) => sum + item.warningCodes.length, 0),
    writes: 0,
    byCanonicalKey: Object.fromEntries(Object.entries(byCanonicalKey).sort(([left], [right]) => left.localeCompare(right))),
    productReports,
  }
}
