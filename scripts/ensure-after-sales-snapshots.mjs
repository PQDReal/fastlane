import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const rawRecapture = process.argv.includes('--raw-recapture')
const run = (file, args = []) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [file, ...args], { cwd: ROOT, stdio: 'inherit', env: process.env })
  child.on('exit', code => code ? reject(new Error(`${path.basename(file)} exited ${code}`)) : resolve())
})

const acquisitionPath = path.join(ROOT, '.local', 'after-sales', 'acquisition-report.json')
if (fs.existsSync(acquisitionPath)) {
  await run('scripts/verify-after-sales-coverage.mjs').catch(() => {})
}
const coveragePath = path.join(ROOT, '.local', 'after-sales', 'coverage-report.json')
const coverage = fs.existsSync(coveragePath) ? JSON.parse(fs.readFileSync(coveragePath, 'utf8')) : null
const recrawlSourceIds = rawRecapture
  ? JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'data', 'after-sales-source-manifest.json'), 'utf8')).sources.map(source => source.id)
  : coverage?.recrawlSourceIds?.length
  ? coverage.recrawlSourceIds
  : coverage ? [] : JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'data', 'after-sales-source-manifest.json'), 'utf8')).sources.map(source => source.id)
for (const sourceId of recrawlSourceIds) {
  const args = [`--source=${sourceId}`]
  if (rawRecapture) args.push('--raw-recapture')
  await run('scripts/after-sales-acquisition.mjs', args)
}
await run('scripts/publish-after-sales-public.mjs')
await run('scripts/validate-after-sales-manifest.mjs')
await run('scripts/validate-after-sales-data.mjs')
try {
  await run('scripts/verify-after-sales-coverage.mjs')
} catch (error) {
  console.error(`Snapshot coverage remains degraded: ${error.message}`)
  process.exitCode = 1
}
