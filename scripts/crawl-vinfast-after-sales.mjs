import fs from 'node:fs'
import dns from 'node:dns/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT = path.join(ROOT, '.local', 'after-sales')
const SOURCE = 'https://vinfastauto.com/vn_vi'
// Explicit seeds protect the crawl from client-rendered navigation or source markup changes.
const SEED_URLS = [
  'https://vinfastauto.com/vn_vi/chinh-sach-bao-hanh-oto',
  'https://vinfastauto.com/vn_vi/dich-vu-sua-chua-oto',
  'https://vinfastauto.com/vn_vi/thong-tin-cuu-ho-oto',
  'https://vinfastauto.com/vn_vi/tim-kiem-showroom-tram-sac',
  'https://vinfastauto.com/vn_vi/bao-duong-xe-vinfast-dinh-ky',
]
const ALLOWED_HOSTS = new Set(['vinfastauto.com', 'www.vinfastauto.com'])
const KEYWORDS = [
  ['warranty', /bảo hành/i],
  ['maintenance', /bảo dưỡng/i],
  ['repair', /sửa chữa/i],
  ['rescue', /cứu hộ/i],
  ['service-center', /xưởng dịch vụ|showroom|trạm sạc/i],
  ['manual', /tài liệu hướng dẫn/i],
]

function absoluteUrl(value, base = SOURCE) {
  try {
    const url = new URL(value, base)
    if (!['http:', 'https:'].includes(url.protocol) || !ALLOWED_HOSTS.has(url.hostname)) return ''
    url.hash = ''
    return url.toString()
  } catch { return '' }
}

function isPrivateAddress(address) {
  const version = net.isIP(address)
  if (version === 4) {
    const [a, b] = address.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  }
  if (version === 6) {
    const normalized = address.toLowerCase()
    return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') ||
      normalized.startsWith('fd') || /^fe[89ab]/.test(normalized)
  }
  return true
}

async function validateDestination(value) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error(`Blocked non-official destination: ${url.hostname}`)
  }
  const addresses = await dns.lookup(url.hostname, { all: true })
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error(`Blocked destination address: ${url.hostname}`)
  }
  return url.toString()
}

function cleanText(value = '') {
  return String(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchPage(url) {
  const safeUrl = await validateDestination(url)
  const response = await fetch(safeUrl, {
    headers: { 'user-agent': 'FastlaneAfterSalesCrawler/1.0 (+admin review)' },
    redirect: 'follow', signal: AbortSignal.timeout(20000),
  })
  const html = await response.text()
  await validateDestination(response.url)
  return { status: response.status, finalUrl: response.url, html }
}

function classify(text, url) {
  const match = KEYWORDS.find(([, pattern]) => pattern.test(`${url} ${text}`))
  return match?.[0] || 'other'
}

function discoverLinks(html, baseUrl) {
  const links = []
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = absoluteUrl(match[1], baseUrl)
    const label = cleanText(match[2])
    if (/hướng dẫn sử dụng ô tô|huong dan su dung o to/i.test(label)) continue
    if (url && KEYWORDS.some(([, pattern]) => pattern.test(`${url} ${label}`))) links.push({ url, label })
  }
  return [...new Map(links.map(item => [item.url, item])).values()]
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

const run = async () => {
  const startedAt = new Date().toISOString()
  const index = await fetchPage(SOURCE)
  const discovered = [...new Map([
    ...SEED_URLS.map(url => [url, { url, label: 'explicit seed' }]),
    ...discoverLinks(index.html, index.finalUrl).map(item => [item.url, item]),
  ]).values()]
  const pages = []
  for (const item of discovered) {
    try {
      const result = await fetchPage(item.url)
      const text = cleanText(result.html)
      pages.push({
        source: 'vinfast-official', sourceUrl: item.url, canonicalUrl: result.finalUrl,
        fetchedAt: new Date().toISOString(), httpStatus: result.status,
        title: cleanText(result.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || item.label),
        serviceType: classify(`${item.label} ${text}`, item.url),
        textLength: text.length, html: result.html, text,
      })
    } catch (error) {
      pages.push({ sourceUrl: item.url, label: item.label, serviceType: classify(item.label, item.url), error: error.message })
    }
  }
  const runId = startedAt.replace(/[:.]/g, '-')
  writeJson(path.join(OUTPUT, 'raw', `${runId}.json`), { runId, source: SOURCE, startedAt, discovered, pages })
  writeJson(path.join(OUTPUT, 'latest.json'), { runId, source: SOURCE, startedAt, discovered, pages: pages.map(({ html, ...page }) => page) })
  console.log(`Crawled ${pages.length} candidate pages. Raw snapshot: .local/after-sales/raw/${runId}.json`)
}

run().catch(error => { console.error(error); process.exitCode = 1 })
