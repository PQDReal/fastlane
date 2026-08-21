import crypto from 'node:crypto'
import dns from 'node:dns/promises'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  executeProvider,
  findLocalBrowserExecutable,
  isVerifiedSnapshot,
  providerCooldownOpen,
  providerQuotaCircuitOpen,
  selectLatestVerifiedSnapshot,
  shouldRetainPreviousSnapshot,
} from './lib/after-sales-provider-utils.mjs'
import {
  buildBrowserlessCdpUrl,
  providerOrderForSource,
  validateBrowserlessCapture,
} from './lib/after-sales-browserless-provider.mjs'
import {
  BRIGHTDATA_PROVIDER,
  buildBrightDataCdpUrl,
  hasBrightDataConfiguration,
  validateBrightDataCapture,
} from './lib/after-sales-brightdata-provider.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_MANIFEST = path.join(ROOT, 'scripts', 'data', 'after-sales-source-manifest.json')
const OUTPUT_ROOT = path.join(ROOT, '.local', 'after-sales', 'snapshots')
const PROVIDER_HEALTH_PATH = path.join(ROOT, '.local', 'after-sales', 'provider-health.json')
const manifest = JSON.parse(fs.readFileSync(SOURCE_MANIFEST, 'utf8'))
const requestedSource = process.argv.find(argument => argument.startsWith('--source='))?.slice('--source='.length)
const diagnosticMode = process.argv.includes('--diagnostic')
const rawRecapture = process.argv.includes('--raw-recapture')
const requestedProviderInput = process.argv.find(argument => argument.startsWith('--provider='))?.slice('--provider='.length)
const providerAliases = new Map([
  ['http', 'http'],
  ['brightdata', 'brightdata_browser_api'],
  ['brightdata_browser_api', 'brightdata_browser_api'],
  ['brightdata_playwright', 'brightdata_browser_api'],
  ['browserless', 'browserless_playwright'],
  ['browserless_playwright', 'browserless_playwright'],
  ['browserbase', 'browserbase_playwright'],
  ['browserbase_playwright', 'browserbase_playwright'],
  ['local', 'local_playwright'],
  ['local_playwright', 'local_playwright'],
  ['last-known-good', 'last_known_good'],
  ['last_known_good', 'last_known_good'],
])
const requestedProvider = requestedProviderInput ? providerAliases.get(requestedProviderInput) : null
const ALLOWED_HOSTS = new Set(['vinfastauto.com', 'www.vinfastauto.com'])
const isOfficialHost = hostname => ALLOWED_HOSTS.has(hostname.toLowerCase()) || hostname.toLowerCase().endsWith('.vinfastauto.com')
const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal'])
const providerHealth = fs.existsSync(PROVIDER_HEALTH_PATH)
  ? JSON.parse(fs.readFileSync(PROVIDER_HEALTH_PATH, 'utf8'))
  : { schemaVersion: 1, providers: {} }

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
      normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
      normalized.startsWith('fea') || normalized.startsWith('feb')
  }
  return true
}

async function validateUrl(value, { exactSource = false } = {}) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || !isOfficialHost(url.hostname) || BLOCKED_HOSTNAMES.has(url.hostname.toLowerCase())) {
    throw new Error(`Blocked non-official destination: ${url.hostname}`)
  }
  if (exactSource && !manifest.sources.some(source => source.url === url.toString())) {
    throw new Error(`URL is not present in the official source manifest: ${url}`)
  }
  const records = await dns.lookup(url.hostname, { all: true })
  if (!records.length || records.some(record => isPrivateAddress(record.address))) {
    throw new Error(`Blocked destination address for ${url.hostname}`)
  }
  return url
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function updateProviderHealth(provider, patch) {
  providerHealth.updatedAt = new Date().toISOString()
  providerHealth.providers[provider] = {
    ...(providerHealth.providers[provider] || {}),
    ...patch,
    checkedAt: new Date().toISOString(),
  }
  writeJson(PROVIDER_HEALTH_PATH, providerHealth)
}

function cleanText(value = '') {
  return String(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractOfficialLinks(html, baseUrl) {
  const links = new Set()
  for (const match of String(html || '').matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)) {
    try {
      const url = new URL(match[1], baseUrl)
      if (url.protocol === 'https:' && ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
        url.hash = ''
        links.add(url.toString())
      }
    } catch {}
  }
  return [...links]
}

function extractAssets(html, baseUrl) {
  const assets = new Map()
  const add = (value, type, label = null) => {
    try {
      const url = new URL(value, baseUrl)
      if (!isOfficialHost(url.hostname) || !['http:', 'https:'].includes(url.protocol)) return
      url.hash = ''
      const key = url.toString()
      assets.set(key, { url: key, type, label })
    } catch {}
  }
  for (const match of String(html || '').matchAll(/<(?:img|source)\b([^>]*)>/gi)) {
    const attributes = match[1]
    const src = attributes.match(/(?:src|srcset)=["']([^"']+)["']/i)?.[1]
    const alt = attributes.match(/alt=["']([^"']*)["']/i)?.[1] || null
    if (src) add(src.split(',')[0].trim().split(' ')[0], 'image', alt)
  }
  for (const match of String(html || '').matchAll(/<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/gi)) add(match[1], 'image', 'og:image')
  for (const match of String(html || '').matchAll(/<a\b[^>]*href=["']([^"']+\.pdf(?:[?#][^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi)) add(match[1], 'pdf', cleanText(match[2]))
  return [...assets.values()]
}

function filterAssetsForSource(source, assets) {
  if (source.serviceType === 'warranty') {
    return assets.filter(asset => asset.type === 'pdf'
      ? /sổ bảo hành/iu.test(asset.label || '')
      : /\/aftersale-warranty\//iu.test(asset.url))
  }
  if (source.serviceType === 'repair') {
    return assets.filter(asset => asset.type === 'image'
      && /\/aftersale-(?:repair|shared)\/(?:repair-|hero-repair)/iu.test(asset.url))
  }
  if (source.serviceType === 'rescue') {
    return assets.filter(asset => asset.type === 'pdf'
      || (asset.type === 'image' && /\/aftersale-rescue\//iu.test(asset.url)))
  }
  return []
}

async function httpProvider(source) {
  await validateUrl(source.url, { exactSource: true })
  const response = await fetch(source.url, {
    headers: {
      'accept': 'text/html,application/xhtml+xml',
      'accept-language': 'vi-VN,vi;q=0.9',
      'user-agent': 'FastlaneAfterSalesAcquisition/1.0',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(25000),
  })
  const html = await response.text()
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`)
    error.status = response.status
    throw error
  }
  return {
    provider: 'http',
    sourceUrl: source.url,
    finalUrl: response.url,
    httpStatus: response.status,
    contentType: response.headers.get('content-type') || 'text/html',
    html,
    text: cleanText(html),
    discoveredLinks: extractOfficialLinks(html, response.url),
    assets: extractAssets(html, response.url),
  }
}

async function loadPlaywright() {
  let playwright
  try {
    playwright = await import('playwright-core')
  } catch {
    throw new Error('playwright-core is not installed')
  }
  return playwright
}

async function installCdpNetworkGuard(context, page) {
  const session = await context.newCDPSession(page)
  await session.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
  session.on('Fetch.requestPaused', event => {
    void (async () => {
      try {
        await validateUrl(event.request.url)
        await session.send('Fetch.continueRequest', { requestId: event.requestId })
      } catch {
        await session.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' })
      }
    })().catch(() => {})
  })
  return session
}

async function expandInteractiveControls(page) {
  const selectors = [
    'button[aria-expanded="false"]',
    '[role="button"][aria-expanded="false"]',
    'details:not([open]) > summary',
  ]
  let expanded = 0
  for (const selector of selectors) {
    const controls = page.locator(selector)
    const count = Math.min(await controls.count(), 100)
    for (let index = 0; index < count; index++) {
      const control = controls.nth(index)
      try {
        const belongsToGlobalNavigation = await control.evaluate(element => Boolean(
          element.closest('header, nav, .dvhm-mega-menu'),
        ))
        if (belongsToGlobalNavigation) continue
        if (!(await control.isVisible())) continue
        await control.scrollIntoViewIfNeeded()
        await control.click({ timeout: 3000 })
        expanded++
        await page.waitForTimeout(150)
      } catch {}
    }
  }
  return expanded
}

async function captureInteractiveStates(page, source) {
  const navigationHubOnly = source.scope?.modelScope === 'navigation_hub_only'
  const vehicleButtons = page.locator('button[data-vehicle]:not(.dvhm-mega-menu__vehicle-btn)')
  const availableVehicles = navigationHubOnly ? [] : await vehicleButtons.evaluateAll(buttons => buttons
    .map(button => button.getAttribute('data-vehicle'))
    .filter(Boolean))
  const preferredVehicle = source.vehicleType === 'car'
    ? 'oto'
    : source.vehicleType === 'motorbike'
      ? 'xemay'
      : source.vehicleType === 'bus'
        ? 'ebus'
        : null
  const requestedVehicles = navigationHubOnly ? [] : source.vehicleType === 'all'
    ? [...new Set(availableVehicles)]
    : preferredVehicle && availableVehicles.includes(preferredVehicle)
      ? [preferredVehicle]
      : [availableVehicles[0]].filter(Boolean)
  const states = []
  const targets = requestedVehicles.length ? requestedVehicles : [null]
  for (const vehicle of targets) {
    if (vehicle) {
      const button = page.locator(`button[data-vehicle="${vehicle}"]`).first()
      try {
        await button.click({ timeout: 5000 })
        await page.waitForTimeout(400)
      } catch {}
    }
    const expandedControls = navigationHubOnly ? 0 : await expandInteractiveControls(page)
    await page.waitForTimeout(250)
    const scoped = page.locator('.dvhm-revamp-page').first()
    const hasScopedContent = await scoped.count() > 0
    const scopedHtml = hasScopedContent
      ? await scoped.evaluate(element => element.outerHTML)
      : await page.locator('body').evaluate(element => element.outerHTML)
    const text = hasScopedContent ? await scoped.innerText() : await page.locator('body').innerText()
    states.push({
      vehicle: vehicle || null,
      expandedControls,
      html: scopedHtml,
      text,
    })
  }
  return states
}

async function captureWithBrowser(source, browser, provider, {
  cdpNetworkGuard = false,
  navigationWaitUntil = 'networkidle',
  navigationTimeout = 45000,
  hydrationWaitMs = 0,
  screenshotTimeout = 15000,
  useDefaultContext = false,
} = {}) {
  // Every provider connection is single-use. Browserless launch/proxy settings belong to its default context.
  const providerContext = useDefaultContext ? browser.contexts()[0] : null
  const context = providerContext || await browser.newContext({ serviceWorkers: 'block' })
  const ownsContext = !providerContext
  try {
    const page = await context.newPage()
    if (cdpNetworkGuard) {
      await installCdpNetworkGuard(context, page)
    } else {
      await context.route('**/*', async route => {
        try {
          await validateUrl(route.request().url())
          await route.continue()
        } catch {
          await route.abort('blockedbyclient')
        }
      })
    }
    const requestedUrls = new Set()
    page.on('request', request => requestedUrls.add(request.url()))
    const response = await page.goto((await validateUrl(source.url, { exactSource: true })).toString(), {
      waitUntil: navigationWaitUntil,
      timeout: navigationTimeout,
    })
    if (!response || !response.ok()) {
      const error = new Error(`HTTP ${response?.status() || 'NO_RESPONSE'}`)
      error.status = response?.status() || null
      throw error
    }
    await validateUrl(page.url())
    if (hydrationWaitMs > 0) await page.waitForTimeout(hydrationWaitMs)
    const interactiveStates = await captureInteractiveStates(page, source)
    const html = await page.content()
    const afterSalesContent = page.locator('.dvhm-revamp-page').first()
    const hasScopedContent = await afterSalesContent.count() > 0
    const scopedHtml = interactiveStates.map(state => state.html).filter(Boolean).join('\n')
    const rawText = interactiveStates.map(state => state.text).filter(Boolean).join('\n\n')
    const text = cleanText(rawText)
    const rawDomHtml = interactiveStates.map((state, index) => `<section data-fastlane-interactive-state="${index}" data-vehicle="${state.vehicle || ''}">${state.html}</section>`).join('\n')
    const rawDomText = text || cleanText(hasScopedContent ? await afterSalesContent.innerText() : await page.locator('body').innerText())
    let screenshotBase64 = null
    const captureWarnings = []
    try {
      const screenshot = await page.screenshot({ type: 'png', fullPage: false, timeout: screenshotTimeout })
      screenshotBase64 = screenshot.toString('base64')
    } catch (error) {
      captureWarnings.push({ stage: 'viewport_screenshot', message: error.message })
    }
    const discoveredLinks = await page.locator('a[href]').evaluateAll(anchors => anchors
      .map(anchor => anchor.href)
      .filter(Boolean))
    return {
      provider,
      sourceUrl: source.url,
      finalUrl: page.url(),
      httpStatus: response?.status() || null,
      contentType: 'text/html',
      html,
      text,
      rawSnapshotVersion: 'after-sales-raw-v2',
      rawDomHtml,
      rawDomText,
      interactiveStates: interactiveStates.map(({ vehicle, expandedControls }) => ({ vehicle, expandedControls })),
      screenshotBase64,
      captureWarnings,
      title: await page.title(),
      discoveredLinks,
      requestedUrls: [...requestedUrls],
      assets: hasScopedContent ? filterAssetsForSource(source, extractAssets(scopedHtml, page.url())) : [],
      extractionScope: hasScopedContent ? '.dvhm-revamp-page' : 'metadata_only',
    }
  } finally {
    if (ownsContext) await context.close()
  }
}

async function browserlessProvider(source) {
  const token = process.env.BROWSERLESS_API_TOKEN
  if (!token) throw new Error('BROWSERLESS_API_TOKEN is not configured')
  const playwright = await loadPlaywright()
  const endpoint = buildBrowserlessCdpUrl({
    token,
    endpoint: process.env.BROWSERLESS_CDP_ENDPOINT || undefined,
    proxy: process.env.BROWSERLESS_PROXY || undefined,
    proxyCountry: process.env.BROWSERLESS_PROXY_COUNTRY || undefined,
    proxySticky: process.env.BROWSERLESS_PROXY_STICKY || undefined,
    proxyLocaleMatch: process.env.BROWSERLESS_PROXY_LOCALE_MATCH || undefined,
    timeout: process.env.BROWSERLESS_SESSION_TIMEOUT_MS || 180_000,
  })
  const browser = await playwright.chromium.connectOverCDP(endpoint, { timeout: 60000 })
  try {
    const capture = await captureWithBrowser(source, browser, 'browserless_playwright', {
      cdpNetworkGuard: true,
      navigationWaitUntil: 'domcontentloaded',
      navigationTimeout: 40000,
      hydrationWaitMs: source.scope?.modelScope === 'navigation_hub_only' ? 750 : 2000,
      screenshotTimeout: source.scope?.modelScope === 'navigation_hub_only' ? 3000 : 5000,
      useDefaultContext: true,
    })
    return validateBrowserlessCapture(source, capture)
  } finally {
    await browser.close()
  }
}

async function browserbaseProvider(source) {
  const apiKey = process.env.BROWSERBASE_API_KEY
  if (!apiKey) throw new Error('BROWSERBASE_API_KEY is not configured')
  const playwright = await loadPlaywright()
  const { Browserbase } = await import('@browserbasehq/sdk')
  const browserbase = new Browserbase({ apiKey })
  const session = await browserbase.sessions.create({
    projectId: process.env.BROWSERBASE_PROJECT_ID || undefined,
    browserSettings: {
      allowedDomains: ['vinfastauto.com'],
      blockAds: true,
      logSession: true,
      recordSession: false,
    },
    keepAlive: false,
    userMetadata: { worker: 'fastlane-after-sales-acquisition', sourceId: source.id },
  })
  const browser = await playwright.chromium.connectOverCDP(session.connectUrl)
  try {
    return await captureWithBrowser(source, browser, 'browserbase_playwright')
  } finally {
    await browser.close()
  }
}

async function brightDataProvider(source) {
  const playwright = await loadPlaywright()
  const browser = await playwright.chromium.connectOverCDP(buildBrightDataCdpUrl(), { timeout: 60000 })
  try {
    const capture = await captureWithBrowser(source, browser, BRIGHTDATA_PROVIDER, {
      cdpNetworkGuard: true,
      navigationWaitUntil: 'domcontentloaded',
      navigationTimeout: 40000,
      hydrationWaitMs: source.scope?.modelScope === 'navigation_hub_only' ? 750 : 2000,
      screenshotTimeout: source.scope?.modelScope === 'navigation_hub_only' ? 3000 : 5000,
      useDefaultContext: true,
    })
    return validateBrightDataCapture(source, capture)
  } finally {
    await browser.close()
  }
}

async function localPlaywrightProvider(source, executablePath) {
  if (!executablePath) throw new Error('Local Chromium/Chrome/Edge executable was not found')
  const playwright = await loadPlaywright()
  const browser = await playwright.chromium.launch({
    executablePath,
    headless: process.env.LOCAL_PLAYWRIGHT_HEADLESS !== 'false',
    args: ['--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-extensions', '--no-first-run'],
  })
  try {
    return await captureWithBrowser(source, browser, 'local_playwright')
  } finally {
    await browser.close()
  }
}

function manualProvider(source) {
  return {
    provider: 'manual_curated',
    sourceUrl: source.url,
    finalUrl: source.url,
    httpStatus: null,
    contentType: 'application/json',
    text: source.evidence || '',
    title: source.id,
    availability: source.availability,
    accuracy: source.accuracy,
  }
}

function healthStatusForFailure(failure) {
  if (failure.code === 'AUTH_FAILED') return 'auth_failed'
  if (failure.code === 'QUOTA_EXHAUSTED') return 'quota_exhausted'
  if (failure.code === 'RATE_LIMITED') return 'rate_limited'
  if (failure.code === 'ACCESS_DENIED') return 'blocked'
  if (failure.code === 'NOT_CONFIGURED') return 'not_configured'
  return 'unavailable'
}

function skippedFailure(provider, code, message, status = null) {
  return { provider, code, status, retryable: false, attempts: 0, skipped: true, message }
}

function quotaRetryAt(hoursValue) {
  const hours = Number(hoursValue || 24)
  return new Date(Date.now() + (Number.isFinite(hours) && hours > 0 ? hours : 24) * 3600000).toISOString()
}

function browserlessCooldownHours() {
  const hours = Number(process.env.BROWSERLESS_COOLDOWN_HOURS || 12)
  return Number.isFinite(hours) && hours > 0 ? hours : 12
}

function browserlessSourceCooldown(source) {
  const provider = providerHealth.providers.browserless_playwright || {}
  const stored = provider.sourceCooldowns?.[source.id]
  const latest = latestVerifiedForSource(source)
  if (latest?.sourceUrl !== source.url) return null
  if (stored?.cooldownUntil) return stored
  if (latest?.captureMethod !== 'browserless_playwright') return null
  const lastSuccessAt = latest.capturedAt
  return {
    lastSuccessAt,
    cooldownUntil: new Date(Date.parse(lastSuccessAt) + browserlessCooldownHours() * 3600000).toISOString(),
    cooldownHours: browserlessCooldownHours(),
  }
}

async function attemptBrowserless(source) {
  const provider = 'browserless_playwright'
  if (!process.env.BROWSERLESS_API_TOKEN) {
    const failure = skippedFailure(provider, 'NOT_CONFIGURED', 'BROWSERLESS_API_TOKEN is not configured')
    updateProviderHealth(provider, { status: 'not_configured', code: failure.code, retryAt: null, lastError: failure.message })
    return { result: null, failure }
  }
  const state = providerHealth.providers[provider]
  const forceRetry = rawRecapture || process.env.BROWSERLESS_FORCE_RETRY === '1'
  const cooldown = browserlessSourceCooldown(source)
  if (cooldown && providerCooldownOpen({ sourceCooldowns: { [source.id]: cooldown } }, source.id, { forceRetry })) {
    updateProviderHealth(provider, {
      status: 'available',
      code: 'AVAILABLE',
      sourceCooldowns: { ...(state?.sourceCooldowns || {}), [source.id]: cooldown },
      cooldownUntil: cooldown.cooldownUntil,
      cooldownHours: cooldown.cooldownHours,
      lastSuccessAt: cooldown.lastSuccessAt,
    })
    return {
      result: null,
      cooldownActive: true,
      failure: skippedFailure(provider, 'COOLDOWN_ACTIVE', `Browserless cooldown active until ${cooldown.cooldownUntil}`),
    }
  }
  if (providerQuotaCircuitOpen(state, { forceRetry })) {
    return {
      result: null,
      failure: skippedFailure(provider, 'QUOTA_EXHAUSTED', `Browserless quota circuit open until ${state.retryAt}`, 402),
    }
  }
  const attempt = await executeProvider(provider, () => browserlessProvider(source), { maxAttempts: 2 })
  if (attempt.result) {
    const lastSuccessAt = new Date().toISOString()
    const successfulCooldown = {
      lastSuccessAt,
      cooldownUntil: new Date(Date.parse(lastSuccessAt) + browserlessCooldownHours() * 3600000).toISOString(),
      cooldownHours: browserlessCooldownHours(),
    }
    updateProviderHealth(provider, {
      status: 'available',
      code: 'AVAILABLE',
      retryAt: null,
      lastError: null,
      lastSuccessAt,
      cooldownUntil: successfulCooldown.cooldownUntil,
      cooldownHours: successfulCooldown.cooldownHours,
      sourceCooldowns: { ...(providerHealth.providers[provider]?.sourceCooldowns || {}), [source.id]: successfulCooldown },
    })
    return attempt
  }
  updateProviderHealth(provider, {
    status: healthStatusForFailure(attempt.failure),
    code: attempt.failure.code,
    retryAt: attempt.failure.code === 'QUOTA_EXHAUSTED'
      ? quotaRetryAt(process.env.BROWSERLESS_QUOTA_RETRY_HOURS)
      : null,
    lastError: attempt.failure.message,
  })
  return attempt
}

async function attemptBrowserbase(source) {
  const provider = 'browserbase_playwright'
  if (!process.env.BROWSERBASE_API_KEY) {
    const failure = skippedFailure(provider, 'NOT_CONFIGURED', 'BROWSERBASE_API_KEY is not configured')
    updateProviderHealth(provider, { status: 'not_configured', code: failure.code, retryAt: null, lastError: failure.message })
    return { result: null, failure }
  }
  const state = providerHealth.providers[provider]
  const forceRetry = process.env.BROWSERBASE_FORCE_RETRY === '1'
  if (providerQuotaCircuitOpen(state, { forceRetry })) {
    return {
      result: null,
      failure: skippedFailure(provider, 'QUOTA_EXHAUSTED', `Browserbase quota circuit open until ${state.retryAt}`, 402),
    }
  }
  const attempt = await executeProvider(provider, () => browserbaseProvider(source), { maxAttempts: 2 })
  if (attempt.result) {
    updateProviderHealth(provider, { status: 'available', code: 'AVAILABLE', retryAt: null, lastError: null })
    return attempt
  }
  updateProviderHealth(provider, {
    status: healthStatusForFailure(attempt.failure),
    code: attempt.failure.code,
    retryAt: attempt.failure.code === 'QUOTA_EXHAUSTED'
      ? quotaRetryAt(process.env.BROWSERBASE_QUOTA_RETRY_HOURS)
      : null,
    lastError: attempt.failure.message,
  })
  return attempt
}

async function attemptBrightData(source) {
  const provider = BRIGHTDATA_PROVIDER
  if (!hasBrightDataConfiguration()) {
    const failure = skippedFailure(provider, 'NOT_CONFIGURED', 'Bright Data Browser API is not configured')
    updateProviderHealth(provider, { status: 'not_configured', code: failure.code, retryAt: null, lastError: failure.message })
    return { result: null, failure }
  }
  const state = providerHealth.providers[provider]
  const forceRetry = rawRecapture || ['1', 'true'].includes(String(process.env.BRIGHTDATA_FORCE_RETRY || '').toLowerCase())
  if (providerQuotaCircuitOpen(state, { forceRetry })) {
    return {
      result: null,
      failure: skippedFailure(provider, 'QUOTA_EXHAUSTED', `Bright Data quota circuit open until ${state.retryAt}`, 402),
    }
  }
  const attempt = await executeProvider(provider, () => brightDataProvider(source), { maxAttempts: 2 })
  if (attempt.result) {
    updateProviderHealth(provider, { status: 'available', code: 'AVAILABLE', retryAt: null, lastError: null, lastSuccessAt: new Date().toISOString() })
    return attempt
  }
  updateProviderHealth(provider, {
    status: healthStatusForFailure(attempt.failure),
    code: attempt.failure.code,
    retryAt: attempt.failure.code === 'QUOTA_EXHAUSTED'
      ? quotaRetryAt(process.env.BRIGHTDATA_QUOTA_RETRY_HOURS)
      : null,
    lastError: attempt.failure.message,
  })
  return attempt
}

async function attemptLocal(source) {
  const provider = 'local_playwright'
  const executablePath = findLocalBrowserExecutable()
  const attempt = await executeProvider(provider, () => localPlaywrightProvider(source, executablePath), { maxAttempts: 2 })
  if (attempt.result) {
    updateProviderHealth(provider, { status: 'available', code: 'AVAILABLE', browser: executablePath ? path.basename(executablePath) : null, lastError: null })
    return attempt
  }
  updateProviderHealth(provider, {
    status: healthStatusForFailure(attempt.failure),
    code: attempt.failure.code,
    browser: executablePath ? path.basename(executablePath) : null,
    lastError: attempt.failure.message,
  })
  return attempt
}

async function attemptProvider(source, provider) {
  if (provider === 'http') return executeProvider('http', () => httpProvider(source))
  if (provider === BRIGHTDATA_PROVIDER) return attemptBrightData(source)
  if (provider === 'browserless_playwright') return attemptBrowserless(source)
  if (provider === 'browserbase_playwright') return attemptBrowserbase(source)
  if (provider === 'local_playwright') return attemptLocal(source)
  throw new Error(`Unsupported acquisition provider: ${provider}`)
}

function providerOrderFor(source) {
  if (rawRecapture) return [BRIGHTDATA_PROVIDER, 'browserless_playwright', 'browserbase_playwright', 'local_playwright']
  return providerOrderForSource(source.id)
}

async function acquire(source) {
  const failures = []
  for (const provider of providerOrderFor(source)) {
    const attempt = await attemptProvider(source, provider)
    if (attempt.result) return { ...attempt.result, acquisitionFailures: failures }
    if (attempt.failure) failures.push(attempt.failure)
    if (attempt.cooldownActive) return { ...manualProvider(source), acquisitionFailures: failures }
  }
  return { ...manualProvider(source), acquisitionFailures: failures, acquisitionFailed: true }
}

function latestVerifiedForSource(source) {
  const sourceDir = path.join(OUTPUT_ROOT, source.id)
  if (!fs.existsSync(sourceDir)) return null
  return selectLatestVerifiedSnapshot(fs.readdirSync(sourceDir)
    .filter(name => name.endsWith('.json') && name !== 'latest.json')
    .map(name => {
      try { return JSON.parse(fs.readFileSync(path.join(sourceDir, name), 'utf8')) } catch { return null }
    })
    .filter(Boolean))
}

async function snapshotSource(source) {
  const capturedAt = new Date().toISOString()
  const result = await acquire(source)
  const payload = result.html || result.text || ''
  const snapshot = {
    snapshotId: `${source.id}-${capturedAt.replace(/[:.]/g, '-')}`,
    sourceId: source.id,
    sourceUrl: source.url,
    capturedAt,
    captureMethod: result.provider,
    finalUrl: result.finalUrl,
    httpStatus: result.httpStatus,
    contentType: result.contentType,
    title: result.title || source.id,
    html: result.html || null,
    text: result.text || '',
    rawSnapshotVersion: result.rawSnapshotVersion || null,
    rawDomHtml: result.rawDomHtml || null,
    rawDomText: result.rawDomText || result.text || '',
    rawDomTextHash: sha256(result.rawDomText || result.text || ''),
    rawDomHtmlHash: result.rawDomHtml ? sha256(result.rawDomHtml) : null,
    interactiveStates: result.interactiveStates || [],
    screenshotBase64: result.screenshotBase64 || null,
    extractionScope: result.extractionScope || (result.provider === 'manual_curated' ? 'manual_curated' : 'full_document'),
    captureWarnings: result.captureWarnings || [],
    contentValidation: result.contentValidation || null,
    contentHash: sha256(payload),
    availability: result.provider === 'manual_curated'
      ? 'curated'
      : result.httpStatus === 200
        ? 'available'
        : 'blocked',
    accuracy: result.accuracy || source.accuracy,
    reviewStatus: 'pending',
    parserVersion: null,
    acquisitionFailures: result.acquisitionFailures || [],
    discoveredLinks: [...new Set(result.discoveredLinks || [])],
    requestedUrls: [...new Set(result.requestedUrls || [])],
    assets: [...new Map((result.assets || []).map(asset => [asset.url, asset])).values()],
  }
  const sourceDir = path.join(OUTPUT_ROOT, source.id)
  const previousVerified = latestVerifiedForSource(source)
  const captureSucceeded = isVerifiedSnapshot(snapshot)
  if (shouldRetainPreviousSnapshot(snapshot, previousVerified)) {
    snapshot.latestRetained = true
    snapshot.retainedSnapshotId = previousVerified.snapshotId
  }
  writeJson(path.join(sourceDir, `${snapshot.snapshotId}.json`), snapshot)
  if (captureSucceeded) {
    writeJson(path.join(sourceDir, 'latest.json'), snapshot)
  } else if (previousVerified) {
    writeJson(path.join(sourceDir, 'latest.json'), previousVerified)
  }
  return snapshot
}

const summarizeSnapshot = snapshot => ({
  sourceId: snapshot.sourceId,
  captureMethod: snapshot.captureMethod,
  availability: snapshot.availability,
  httpStatus: snapshot.httpStatus,
  contentHash: snapshot.contentHash,
  rawSnapshotVersion: snapshot.rawSnapshotVersion || null,
  rawDomTextHash: snapshot.rawDomTextHash || null,
  interactiveStates: snapshot.interactiveStates || [],
  extractionScope: snapshot.extractionScope || null,
  captureWarnings: snapshot.captureWarnings || [],
  contentValidation: snapshot.contentValidation || null,
  acquisitionFailures: snapshot.acquisitionFailures,
  latestRetained: snapshot.latestRetained || false,
  retainedSnapshotId: snapshot.retainedSnapshotId || null,
})

async function runDiagnostic(source, provider) {
  const checkedAt = new Date().toISOString()
  if (provider === 'last_known_good') {
    const snapshot = latestVerifiedForSource(source)
    return {
      checkedAt,
      sourceId: source.id,
      provider,
      classification: snapshot ? 'AVAILABLE' : 'PROVIDER_ERROR',
      success: Boolean(snapshot),
      snapshot: snapshot ? summarizeSnapshot(snapshot) : null,
      message: snapshot ? `Retained ${snapshot.snapshotId}` : 'No verified snapshot is available',
    }
  }
  const attempt = await attemptProvider(source, provider)
  const cooldownActive = Boolean(attempt.cooldownActive)
  return {
    checkedAt,
    sourceId: source.id,
    provider,
    classification: attempt.result || cooldownActive ? 'AVAILABLE' : attempt.failure?.code || 'PROVIDER_ERROR',
    success: Boolean(attempt.result) || cooldownActive,
    skipped: Boolean(attempt.failure?.skipped),
    cooldownActive,
    attempts: attempt.failure?.attempts ?? (attempt.result ? 1 : 0),
    httpStatus: attempt.result?.httpStatus ?? attempt.failure?.status ?? null,
    finalUrl: attempt.result?.finalUrl || null,
    extractionScope: attempt.result?.extractionScope || null,
    textLength: attempt.result?.text?.length || 0,
    contentValidation: attempt.result?.contentValidation || null,
    message: attempt.failure?.message || null,
  }
}

const sources = manifest.sources.filter(source => !requestedSource || source.id === requestedSource)
if (requestedSource && !sources.length) throw new Error(`Unknown source: ${requestedSource}`)

if (diagnosticMode) {
  if (!requestedSource) throw new Error('--diagnostic requires --source=<source-id>')
  if (!requestedProviderInput || !requestedProvider) {
    throw new Error('--diagnostic requires --provider=http|brightdata|browserless|browserbase|local|last-known-good')
  }
  const diagnostic = await runDiagnostic(sources[0], requestedProvider)
  const diagnosticDir = path.join(ROOT, '.local', 'after-sales', 'source-diagnostics', sources[0].id)
  writeJson(path.join(diagnosticDir, `${requestedProvider}.json`), diagnostic)
  console.log(JSON.stringify(diagnostic, null, 2))
  if (!diagnostic.success) process.exitCode = 1
} else {
  const results = []
  for (const source of sources) results.push(await snapshotSource(source))
  const latestSnapshots = manifest.sources
    .map(source => {
      const latestPath = path.join(OUTPUT_ROOT, source.id, 'latest.json')
      return fs.existsSync(latestPath) ? JSON.parse(fs.readFileSync(latestPath, 'utf8')) : null
    })
    .filter(Boolean)
  const report = {
    runAt: new Date().toISOString(),
    requestedSource: requestedSource || null,
    rawRecapture,
    providerOrder: requestedSource && sources.length
      ? [...providerOrderFor(sources[0]), 'manual_curated']
      : ['http', BRIGHTDATA_PROVIDER, 'browserless_playwright', 'browserbase_playwright', 'local_playwright', 'manual_curated'],
    providerHealth: providerHealth.providers,
    runSources: results.map(summarizeSnapshot),
    sources: latestSnapshots.map(summarizeSnapshot),
  }
  writeJson(path.join(ROOT, '.local', 'after-sales', 'acquisition-report.json'), report)
  console.log(JSON.stringify(report, null, 2))
}

// Some remote CDP providers keep internal WebSocket/timer handles alive after
// browser.close(). A scheduled snapshot job must terminate before Railway can
// start its next cron execution, so explicitly exit only when the deployment
// opts into this CLI-only behavior. All snapshot/report writes above are sync.
const forceProcessExit = ['1', 'true', 'yes'].includes(
  String(process.env.AFTER_SALES_ACQUISITION_FORCE_EXIT || '').toLowerCase(),
)
if (forceProcessExit) {
  await Promise.all([
    new Promise(resolve => process.stdout.write('', resolve)),
    new Promise(resolve => process.stderr.write('', resolve)),
  ])
  process.exit(process.exitCode || 0)
}
