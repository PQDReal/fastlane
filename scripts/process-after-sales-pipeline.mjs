import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reuseVerifiedAssets = process.argv.includes('--reuse-verified-assets')

function run(file, args = [], { allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file, ...args], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    })
    child.on('exit', code => {
      if (code && !allowFailure) reject(new Error(`${path.basename(file)} exited ${code}`))
      else resolve(code || 0)
    })
  })
}

function readJson(relativePath) {
  const file = path.join(ROOT, relativePath)
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
}

const stageResults = []
const degradedReasons = []
let fatalError = null

async function runStage(name, file, args = [], options = {}) {
  try {
    const exitCode = await run(file, args, options)
    stageResults.push({ name, status: exitCode ? 'failed' : 'passed', exitCode })
    return exitCode
  } catch (error) {
    stageResults.push({ name, status: 'failed', error: error.message })
    throw error
  }
}

try {
  try {
    await runStage('ensure_snapshots', 'scripts/ensure-after-sales-snapshots.mjs')
  } catch (error) {
    degradedReasons.push(error.message)
    const coverage = readJson('.local/after-sales/coverage-report.json')
    const acquisition = readJson('.local/after-sales/acquisition-report.json')
    if (coverage?.recrawlSourceIds?.length) degradedReasons.push(`recrawl required: ${coverage.recrawlSourceIds.join(', ')}`)
    for (const attempt of acquisition?.runSources || []) {
      if (!attempt.latestRetained) continue
      const failures = (attempt.acquisitionFailures || []).map(item => `${item.provider}: ${item.message}`).join('; ')
      degradedReasons.push(`${attempt.sourceId}: retained ${attempt.retainedSnapshotId}; ${failures}`)
    }
  }
  await runStage('parse_assets', 'scripts/parse-after-sales-assets.mjs')
  const verifyArgs = reuseVerifiedAssets ? ['--retry-failed'] : []
  const verifyExit = await runStage('verify_assets', 'scripts/verify-after-sales-assets.mjs', verifyArgs, { allowFailure: true })
  if (verifyExit) await runStage('retry_failed_assets', 'scripts/verify-after-sales-assets.mjs', ['--retry-failed'])
  await runStage('extract_content', 'scripts/extract-after-sales-content.mjs', ['--reuse-extracted'])
  await runStage('normalize_facts', 'scripts/normalize-after-sales-facts.mjs')
  await runStage('validate_facts', 'scripts/validate-after-sales-facts.mjs')
  await runStage('validate_regressions', 'scripts/validate-after-sales-regressions.mjs')
} catch (error) {
  fatalError = error
}

const coverageReport = readJson('.local/after-sales/coverage-report.json')
const dataValidationReport = readJson('.local/after-sales/validation-report.json')
const assetVerificationReport = readJson('.local/after-sales/asset-verification-report.json')
const factValidationReport = readJson('.local/after-sales/fact-validation-report.json')
const providerHealthReport = readJson('.local/after-sales/provider-health.json')
const regressionReport = readJson('.local/after-sales/regression-report.json')
const sourceFresh = coverageReport?.summary?.failing === 0
const dataValid = dataValidationReport?.summary?.errors === 0
  && assetVerificationReport?.summary?.failed === 0
  && factValidationReport?.summary?.errors === 0
  && factValidationReport?.summary?.warnings === 0
  && regressionReport?.failures?.length === 0
const providerDegraded = Object.values(providerHealthReport?.providers || {}).some(provider => !['available', 'not_configured'].includes(provider.status))
const pipelineStatus = fatalError
  ? 'FAILED'
  : degradedReasons.length
    ? 'DEGRADED'
    : dataValid
      ? 'PASS'
      : 'REVIEW'

const report = {
  pipelineVersion: 'after-sales-pipeline-v2',
  completedAt: new Date().toISOString(),
  status: pipelineStatus,
  degradedReasons,
  fatalError: fatalError?.message || null,
  gates: {
    SOURCE_FRESH: sourceFresh ? 'PASS' : 'FAIL',
    DATA_VALID: dataValid ? 'PASS' : 'FAIL',
    PROVIDER_HEALTH: providerDegraded ? 'DEGRADED' : 'PASS',
    HUMAN_APPROVAL: 'PENDING',
  },
  dataFreshness: sourceFresh ? 'fresh' : 'stale',
  dataIntegrity: dataValid ? 'valid' : 'invalid',
  stages: stageResults,
  acquisitionAttempts: readJson('.local/after-sales/acquisition-report.json')?.runSources || [],
  providerHealth: providerHealthReport?.providers || {},
  coverage: coverageReport?.summary || null,
  dataValidation: dataValidationReport?.summary || null,
  assetVerification: assetVerificationReport?.summary || null,
  extraction: readJson('public/data/after-sales-extracted.json')?.summary || null,
  normalization: readJson('public/data/after-sales-normalized.json')?.summary || null,
  factValidation: factValidationReport?.summary || null,
  regressions: regressionReport ? {
    assertions: regressionReport.assertions,
    failures: regressionReport.failures.length,
    decision: regressionReport.decision,
  } : null,
}

const output = path.join(ROOT, '.local', 'after-sales', 'pipeline-report.json')
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
if (fatalError || degradedReasons.length || !dataValid) process.exitCode = 1
