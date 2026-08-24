import { config } from 'dotenv'

import { auditCatalogProducts, canonicalProductType, type CatalogProductInput } from '../lib/catalog-intelligence'
import { getSupabaseAdmin } from '../lib/supabase-admin'

config({ path: '.env.local', override: false, quiet: true })

type ProductRow = {
  id: string
  name: string
  product_type: string | null
  specifications: unknown
  updated_at: string | null
}

function numberArgument(name: string) {
  const prefix = `--${name}=`
  const raw = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length)
  if (raw === undefined) return null
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) throw new Error(`${prefix}<positive integer> is required.`)
  return value
}

async function main() {
  if (process.argv.includes('--apply')) {
    throw new Error('Apply mode is intentionally disabled until persistence parity gates pass. Use --dry-run.')
  }

  const limit = numberArgument('limit')
  const json = process.argv.includes('--json')
  const includeDetails = process.argv.includes('--details')
  const supabase = getSupabaseAdmin()
  let request = supabase
    .from('products')
    .select('id,name,product_type,specifications,updated_at')
    .eq('is_active', true)
    .order('id', { ascending: true })
  if (limit !== null) request = request.limit(limit)

  const { data, error } = await request
  if (error) throw new Error(`Unable to load catalog for deterministic audit: ${error.message}`)

  const unsupportedProducts: Array<{ id: string; name: string; productType: string | null }> = []
  const products = ((data ?? []) as ProductRow[]).flatMap((row): CatalogProductInput[] => {
    const productType = canonicalProductType(row.product_type)
    if (!productType) {
      unsupportedProducts.push({ id: row.id, name: row.name, productType: row.product_type })
      return []
    }
    return [{ id: row.id, name: row.name, productType, specifications: row.specifications, updatedAt: row.updated_at }]
  })
  const report = auditCatalogProducts(products)
  const output = includeDetails ? { ...report, unsupportedProducts } : {
    mode: report.mode,
    products: report.products,
    unsupportedProducts: unsupportedProducts.length,
    rawObservations: report.rawObservations,
    resolved: report.resolved,
    resolvedFacts: report.resolvedFacts,
    ignored: report.ignored,
    sourceConflicts: report.sourceConflicts,
    unknown: report.unknown,
    ambiguous: report.ambiguous,
    invalid: report.invalid,
    extractionWarnings: report.extractionWarnings,
    writes: report.writes,
    byCanonicalKey: report.byCanonicalKey,
  }

  if (json) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
    return
  }

  const summary = [
    ['Chế độ', report.mode],
    ['Sản phẩm', report.products],
    ['Product type chưa hỗ trợ', unsupportedProducts.length],
    ['Raw observations', report.rawObservations],
    ['Resolved', report.resolved],
    ['Resolved facts (with context)', report.resolvedFacts],
    ['Ignored by reviewed policy', report.ignored],
    ['Blocked by source review', report.sourceConflicts],
    ['Unknown', report.unknown],
    ['Ambiguous', report.ambiguous],
    ['Invalid', report.invalid],
    ['Extraction warnings', report.extractionWarnings],
    ['Database writes', report.writes],
  ]
  const width = Math.max(...summary.map(([label]) => String(label).length))
  process.stdout.write(`${summary.map(([label, value]) => `${String(label).padEnd(width)} : ${value}`).join('\n')}\n`)
  process.stdout.write('\nCanonical coverage by product count:\n')
  for (const [key, count] of Object.entries(report.byCanonicalKey)) process.stdout.write(`  ${key.padEnd(24)} ${count}\n`)

  if (includeDetails) {
    process.stdout.write('\nExtractor warnings:\n')
    for (const product of report.productReports.filter((item) => item.warningCodes.length)) {
      process.stdout.write(`  ${product.productName}: ${product.warningCodes.join(', ')}\n`)
    }
    process.stdout.write('\nProducts with unresolved observations:\n')
    for (const product of report.productReports.filter((item) => item.unknownCount || item.ambiguousCount || item.invalidCount)) {
      process.stdout.write(`  ${product.productName}: unknown=${product.unknownCount}, ambiguous=${product.ambiguousCount}, invalid=${product.invalidCount}\n`)
      for (const issue of product.issues.filter((item) => item.status !== 'IGNORED')) {
        const rawValue = JSON.stringify(issue.rawValue)
        process.stdout.write(`    - ${issue.status}: ${issue.sourcePath} = ${rawValue}${issue.detail ? ` (${issue.detail})` : ''}\n`)
      }
    }
    process.stdout.write('\nObservations ignored by reviewed policy:\n')
    for (const product of report.productReports.filter((item) => item.ignoredCount)) {
      process.stdout.write(`  ${product.productName}: ignored=${product.ignoredCount}\n`)
      for (const issue of product.issues.filter((item) => item.status === 'IGNORED')) {
        process.stdout.write(`    - ${issue.sourcePath}: ${issue.detail}\n`)
      }
    }
    process.stdout.write('\nSnapshots blocked by official-source review:\n')
    for (const product of report.productReports.filter((item) => item.sourceConflictCount)) {
      process.stdout.write(`  ${product.productName}: blocked_observations=${product.sourceConflictCount}\n`)
      process.stdout.write(`    - ${product.sourceReview?.reasonCode}: ${product.sourceReview?.reason}\n`)
      for (const url of product.sourceReview?.evidenceUrls ?? []) process.stdout.write(`      ${url}\n`)
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
