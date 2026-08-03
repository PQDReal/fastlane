import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const nextDirectory = join(process.cwd(), '.next')
const buildManifestPath = join(nextDirectory, 'build-manifest.json')
const appManifestPath = join(nextDirectory, 'app-build-manifest.json')

if (!existsSync(buildManifestPath) || !existsSync(appManifestPath)) {
  throw new Error('Missing .next manifests. Run npm run build before checking budgets.')
}

const buildManifest = JSON.parse(readFileSync(buildManifestPath, 'utf8'))
const appManifest = JSON.parse(readFileSync(appManifestPath, 'utf8'))

function byteSize(files) {
  return [...new Set(files)]
    .filter((file) => file.endsWith('.js'))
    .reduce((total, file) => total + statSync(join(nextDirectory, file)).size, 0)
}

const budgets = {
  shared: 400_000,
  route: 650_000,
}

const sharedBytes = byteSize(buildManifest.rootMainFiles ?? [])
const routes = [
  '/page',
  '/bikes/page',
  '/bikes/[slug]/page',
  '/accessories/page',
  '/accessories/[slug]/page',
  '/deposit/page',
]

const failures = []
if (sharedBytes > budgets.shared) {
  failures.push(`Shared JavaScript ${sharedBytes} B exceeds ${budgets.shared} B.`)
}

console.log(`Shared JavaScript: ${sharedBytes} B / ${budgets.shared} B`)
for (const route of routes) {
  const files = appManifest.pages?.[route]
  if (!files) {
    failures.push(`Missing build manifest entry for ${route}.`)
    continue
  }
  const bytes = byteSize(files)
  console.log(`${route}: ${bytes} B / ${budgets.route} B`)
  if (bytes > budgets.route) {
    failures.push(`${route} JavaScript ${bytes} B exceeds ${budgets.route} B.`)
  }
}

if (failures.length > 0) {
  throw new Error(`Performance budget failed:\n${failures.join('\n')}`)
}
