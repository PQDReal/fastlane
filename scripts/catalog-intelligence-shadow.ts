import { config } from 'dotenv'

import {
  canonicalProductType,
  compareLegacyAndCanonicalCatalog,
  type CatalogProductInput,
} from '../lib/catalog-intelligence'
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
  if (process.argv.includes('--apply')) throw new Error('Shadow comparison is read-only and does not support --apply.')
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
  if (error) throw new Error(`Unable to load catalog for shadow comparison: ${error.message}`)

  const unsupportedProducts: Array<{ id: string; name: string; productType: string | null }> = []
  const products = ((data ?? []) as ProductRow[]).flatMap((row): CatalogProductInput[] => {
    const productType = canonicalProductType(row.product_type)
    if (!productType) {
      unsupportedProducts.push({ id: row.id, name: row.name, productType: row.product_type })
      return []
    }
    return [{
      id: row.id,
      name: row.name,
      productType,
      specifications: row.specifications,
      updatedAt: row.updated_at,
    }]
  })
  const report = compareLegacyAndCanonicalCatalog(products)

  if (json) {
    const output = includeDetails
      ? { ...report, unsupportedProducts }
      : { ...report, productReports: undefined, unsupportedProducts: unsupportedProducts.length }
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
    return
  }

  const summary = [
    ['Chế độ', report.mode],
    ['Sản phẩm đầu vào', report.products],
    ['Vehicle products', report.vehicleProducts],
    ['Accessories bỏ qua', report.accessoryProductsSkipped],
    ['Product type chưa hỗ trợ', unsupportedProducts.length],
    ['Source-blocked products', report.sourceBlockedProducts],
    ['Legacy warning products', report.legacyWarningProducts],
    ['Facts trong báo cáo', report.factsCompared],
    ['MATCH', report.matches],
    ['VALUE_MISMATCH', report.valueMismatches],
    ['LEGACY_ONLY', report.legacyOnly],
    ['CANONICAL_ONLY', report.canonicalOnly],
    ['CONTEXT_SPLIT', report.contextSplits],
    ['CANONICAL_BLOCKED', report.canonicalBlocked],
    ['Match rate', report.matchRate === null ? 'n/a' : `${(report.matchRate * 100).toFixed(2)}%`],
    ['Database writes', report.writes],
  ]
  const width = Math.max(...summary.map(([label]) => String(label).length))
  process.stdout.write(`${summary.map(([label, value]) => `${String(label).padEnd(width)} : ${value}`).join('\n')}\n`)
  process.stdout.write('\nCut-over readiness by canonical key:\n')
  for (const [key, readiness] of Object.entries(report.keyReadiness)) {
    process.stdout.write(
      `  ${key.padEnd(24)} ${readiness.readyForCutover ? 'READY  ' : 'HOLD   '}`
      + ` match=${readiness.match} mismatch=${readiness.valueMismatch}`
      + ` legacy_only=${readiness.legacyOnly} context_split=${readiness.contextSplit}`
      + ` blocked=${readiness.canonicalBlocked}\n`,
    )
  }

  if (includeDetails) {
    process.stdout.write('\nProducts requiring review:\n')
    for (const product of report.productReports.filter((item) => (
      item.legacyWarningCodes.length > 0
      || item.factComparisons.some((fact) => !['MATCH', 'CANONICAL_ONLY'].includes(fact.status))
    ))) {
      process.stdout.write(`  ${product.productName} (${product.productId})\n`)
      if (product.legacyWarningCodes.length) {
        process.stdout.write(`    legacy warnings: ${product.legacyWarningCodes.join(', ')}\n`)
      }
      if (product.sourceReviewDisposition) {
        process.stdout.write(`    source review: ${product.sourceReviewDisposition}\n`)
      }
      for (const fact of product.factComparisons.filter((item) => !['MATCH', 'CANONICAL_ONLY'].includes(item.status))) {
        process.stdout.write(`    - ${fact.status} ${fact.canonicalKey}: ${fact.reason}\n`)
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
