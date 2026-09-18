import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse')
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const input = path.join(ROOT, 'public/data/after-sales-verified.json')
const output = path.join(ROOT, 'public/data/after-sales-extracted.json')
const data = JSON.parse(fs.readFileSync(input, 'utf8'))
const reuseExtracted = process.argv.includes('--reuse-extracted')
const previous = reuseExtracted && fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : null
const maxOcr = Number(process.env.AFTER_SALES_MAX_OCR || 30)
const timeout = Number(process.env.AFTER_SALES_EXTRACTION_TIMEOUT_MS || 120000)

const extractionCache = new Map(
  (previous?.records || []).flatMap(source => (source.assets || []).map(asset => [
    `${source.sourceId}|${asset.url}|${asset.contentHash || ''}|${asset.classification?.dataType || ''}`,
    asset,
  ])),
)

function facts(text) {
  return [...new Set(String(text || '').match(/\b\d+(?:[.,]\d+)?\s*(?:km|kilomet|năm|tháng|year|month|%|VND|đồng)\b/gi) || [])].map(value => ({ raw: value.trim(), source: 'ocr_or_pdf_text' }))
}

async function renderPdfPage(pageData) {
  const textContent = await pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false })
  let lastY
  let text = ''
  for (const item of textContent.items || []) {
    const value = String(item.str || '')
    const sameLine = lastY === item.transform?.[5]
    const needsSpace = sameLine
      && /[\p{L}\p{N}]$/u.test(text)
      && /^[\p{L}\p{N}]/u.test(value)
    text += lastY === undefined ? value : sameLine ? `${needsSpace ? ' ' : ''}${value}` : `\n${value}`
    lastY = item.transform?.[5]
  }
  return text
}

async function fetchBytes(url) {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(timeout), headers: { 'user-agent': 'FastlaneAfterSalesExtractor/1.0' } })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

let ocrWorker = null
let ocrCount = 0
async function ocr(buffer) {
  if (!ocrWorker) {
    const { createWorker } = await import('tesseract.js')
    ocrWorker = await createWorker('vie+eng')
  }
  ocrCount++
  let prepared = buffer
  try {
    const sharp = (await import('sharp')).default
    const image = sharp(buffer)
    const metadata = await image.metadata()
    const scale = Math.max(1, Math.min(6, Math.ceil(900 / Math.max(metadata.width || 1, metadata.height || 1))))
    prepared = await image
      .resize({ width: Math.max(300, (metadata.width || 1) * scale), height: Math.max(300, (metadata.height || 1) * scale), fit: 'inside' })
      .greyscale()
      .normalize()
      .sharpen()
      .png()
      .toBuffer()
  } catch {}
  const result = await ocrWorker.recognize(prepared)
  return result.data.text || ''
}

const records = []
let reusedExtractions = 0
for (const source of data.records) {
  const assets = []
  for (const asset of source.assets || []) {
    const item = { ...asset, extraction: { status: asset.extractionStatus, method: null, text: null, facts: [], confidence: 0, provenance: { sourceId: source.sourceId, sourceUrl: source.sourceUrl, assetUrl: asset.url } } }
    const shouldExtractPdf = asset.classification.dataType === 'policy_document'
    const shouldExtractImage = asset.classification.dataType === 'informational_graphic_or_table' && ocrCount < maxOcr
    if (!shouldExtractPdf && !shouldExtractImage) { assets.push(item); continue }
    const cacheKey = `${source.sourceId}|${asset.url}|${asset.contentHash || ''}|${asset.classification?.dataType || ''}`
    const cached = extractionCache.get(cacheKey)
    const cacheHasPageProvenance = !shouldExtractPdf
      || (Array.isArray(cached?.extraction?.pages) && cached.extraction.pages.length === cached.extraction.pageCount)
    if (cached?.extraction?.status === 'extracted' && cacheHasPageProvenance) {
      item.extraction = {
        ...cached.extraction,
        provenance: { sourceId: source.sourceId, sourceUrl: source.sourceUrl, assetUrl: asset.url },
      }
      reusedExtractions++
      assets.push(item)
      continue
    }
    try {
      const bytes = await fetchBytes(asset.url)
      if (shouldExtractPdf) {
        const pages = []
        const parsed = await pdfParse(bytes, {
          pagerender: async pageData => {
            const pageText = await renderPdfPage(pageData)
            pages.push({ pageNumber: pages.length + 1, text: pageText, characterCount: pageText.length })
            return pageText
          },
        })
        const text = String(parsed.text || '').trim()
        item.extraction = { ...item.extraction, status: text.length ? 'extracted' : 'ocr_required', method: text.length ? 'pdf_text_layer' : 'pdf_no_text_layer', text: text || null, pages, facts: facts(text), confidence: text.length ? 0.95 : 0.35, pageCount: parsed.numpages || null }
        if (!text.length) item.reviewReasons = [...new Set([...(item.reviewReasons || []), 'OCR_REQUIRED'])]
      } else {
        const text = await ocr(bytes)
        item.extraction = { ...item.extraction, status: text.trim() ? 'extracted' : 'review_required', method: 'tesseract_ocr_vie_eng', ocrLanguage: 'vie+eng', text: text.trim() || null, facts: facts(text), confidence: text.trim() ? 0.7 : 0.2 }
        if (!text.trim()) item.reviewReasons = [...new Set([...(item.reviewReasons || []), 'OCR_EMPTY'])]
      }
    } catch (error) {
      item.extraction = { ...item.extraction, status: 'failed', method: shouldExtractPdf ? 'pdf_text_layer' : 'tesseract_ocr_vie_eng', ocrLanguage: shouldExtractPdf ? null : 'vie+eng', error: error.message, confidence: 0 }
      item.reviewReasons = [...new Set([...(item.reviewReasons || []), 'EXTRACTION_FAILED'])]
    }
    assets.push(item)
  }
  records.push({ ...source, assets })
}
if (ocrWorker) await ocrWorker.terminate()
const summary = { pdfCandidates: data.records.flatMap(source => source.assets || []).filter(asset => asset.classification.dataType === 'policy_document').length, pdfExtracted: records.flatMap(source => source.assets || []).filter(asset => asset.extraction?.method === 'pdf_text_layer' && asset.extraction?.status === 'extracted').length, pdfPagesExtracted: records.flatMap(source => source.assets || []).reduce((sum, asset) => sum + (asset.extraction?.pages?.length || 0), 0), imageOcrCandidates: Math.min(maxOcr, data.records.flatMap(source => source.assets || []).filter(asset => asset.classification.dataType === 'informational_graphic_or_table').length), imageOcrExtracted: records.flatMap(source => source.assets || []).filter(asset => asset.extraction?.method === 'tesseract_ocr_vie_eng' && asset.extraction?.status === 'extracted').length, reusedExtractions }
const result = { ...data, extractorVersion: 'after-sales-content-v2', extractedAt: new Date().toISOString(), summary, records }
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify(summary, null, 2))
