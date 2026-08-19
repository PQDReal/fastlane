import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, '.local/after-sales/discovered')
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/data/after-sales-source-manifest.json'), 'utf8'))
const allowedHost = /(^|\.)vinfastauto\.com$/i
const excluded = /hướng dẫn sử dụng ô tô|huong dan su dung o to|owner manual|user guide/i
const serviceScope = /^(https:\/\/vinfastauto\.com\/vn_vi\/?)$|chinh-sach-bao-hanh-oto|bao-duong-xe-vinfast-dinh-ky|dich-vu-sua-chua-oto|thong-tin-cuu-ho-oto/i
const maxPages = Number(process.env.AFTER_SALES_MAX_DISCOVERED_PAGES || 100)
const maxDepth = Number(process.env.AFTER_SALES_MAX_DISCOVERY_DEPTH || 2)

function hash(value) { return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}` }
function safeUrl(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !allowedHost.test(url.hostname)) return null
    if (!serviceScope.test(url.toString())) return null
    url.hash = ''
    return url.toString()
  } catch { return null }
}
function clean(value = '') { return String(value).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }
function links(html, base) {
  const output = []
  for (const match of String(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = clean(match[2]).toLowerCase()
    if (excluded.test(label)) continue
    try { const url = safeUrl(new URL(match[1], base).toString()); if (url) output.push(url) } catch {}
  }
  return [...new Set(output)]
}
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`) }

const previousFile = path.join(OUT, 'latest.json')
const previous = fs.existsSync(previousFile) ? JSON.parse(fs.readFileSync(previousFile, 'utf8')) : null
const scopeVersion = 'after-sales-hub-four-children-v1'
const resumable = previous?.scopeVersion === scopeVersion
const queue = resumable && previous?.remainingQueue?.length ? previous.remainingQueue : manifest.sources.map(source => ({ url: source.url, depth: 0, parent: null }))
const visited = new Set(resumable ? previous?.visitedUrls || [] : [])
const pages = [], skipped = []
const { Browserbase } = await import('@browserbasehq/sdk')
const { chromium } = await import('playwright-core')
const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY })
if (!process.env.BROWSERBASE_API_KEY) throw new Error('BROWSERBASE_API_KEY is not configured')
const session = await bb.sessions.create({ projectId: process.env.BROWSERBASE_PROJECT_ID || undefined, browserSettings: { allowedDomains: ['vinfastauto.com', 'www.vinfastauto.com'], blockAds: true, recordSession: false }, keepAlive: false, userMetadata: { worker: 'fastlane-after-sales-discovery' } })
const browser = await chromium.connectOverCDP(session.connectUrl)
try {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  await context.route('**/*', async route => {
    try { if (!safeUrl(route.request().url())) throw new Error('blocked'); await route.continue() } catch { await route.abort('blockedbyclient') }
  })
  while (queue.length && pages.length < maxPages) {
    const item = queue.shift()
    if (visited.has(item.url)) continue
    visited.add(item.url)
    const page = await context.newPage()
    try {
      const response = await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)
      const finalUrl = safeUrl(page.url())
      if (!finalUrl) { skipped.push({ ...item, reason: 'redirected outside official non-manual scope' }); await page.close(); continue }
      const html = await page.content()
      const text = await page.locator('body').innerText().catch(() => clean(html))
      const discovered = links(html, finalUrl)
      pages.push({ url: item.url, finalUrl, parent: item.parent, depth: item.depth, title: await page.title(), httpStatus: response?.status() || null, capturedAt: new Date().toISOString(), contentHash: hash(html), text, html, discoveredLinks: discovered })
      if (item.depth < maxDepth) for (const url of discovered) if (!visited.has(url)) queue.push({ url, depth: item.depth + 1, parent: finalUrl })
    } catch (error) { skipped.push({ ...item, reason: error.message }) } finally { await page.close() }
  }
} finally { await browser.close() }
const result = { scopeVersion, capturedAt: new Date().toISOString(), maxPages, maxDepth, seedCount: manifest.sources.length, visitedCount: visited.size, visitedUrls: [...visited], pages, skipped, remainingQueue: queue }
write(path.join(OUT, 'latest.json'), result)
write(path.join(OUT, `run-${Date.now()}.json`), result)
console.log(JSON.stringify({ captured: pages.length, skipped: skipped.length, visited: visited.size, remainingQueue: queue.length, output: '.local/after-sales/discovered/latest.json' }, null, 2))
