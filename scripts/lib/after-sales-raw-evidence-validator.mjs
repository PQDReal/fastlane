import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(String(value || '')).digest('hex')}`
}

function normalized(value) {
  return String(value || '').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('vi')
}

function canonicalText(value) {
  return String(value || '')
    .replace(/\u0000/g, ' ')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function inBounds(index, text) {
  return Number.isInteger(index) && index >= 0 && index <= text.length
}

function durationInMonths(value) {
  const match = normalized(value).match(/(\d+(?:[.,]\d+)?)\s*(năm|year|years|tháng|month|months)\b/u)
  if (!match) return null
  const amount = Number(match[1].replace(',', '.'))
  return /năm|year/u.test(match[2]) ? amount * 12 : amount
}

function sourceValueIsEquivalent(sourceValueText, factValueText) {
  if (normalized(sourceValueText) === normalized(factValueText)) return true
  const sourceMonths = durationInMonths(sourceValueText)
  const factMonths = durationInMonths(factValueText)
  return sourceMonths !== null && factMonths !== null && sourceMonths === factMonths
}

function validateSlice({ fact, provenance, contextIndex, rawText, anchorLabel, errors }) {
  if (!inBounds(contextIndex.sourceStart, rawText)
    || !inBounds(contextIndex.sourceEnd, rawText)
    || !inBounds(contextIndex.excerptStart, rawText)
    || !inBounds(contextIndex.excerptEnd, rawText)
    || !inBounds(contextIndex.matchStart, rawText)
    || !inBounds(contextIndex.matchEnd, rawText)) {
    errors.push(`${fact.factId}: ${anchorLabel} offsets are outside the raw text bounds`)
    return
  }
  const rawExcerpt = rawText.slice(contextIndex.excerptStart, contextIndex.excerptEnd)
  const rawMatch = rawText.slice(contextIndex.matchStart, contextIndex.matchEnd)
  const sourceValueText = provenance.sourceValueText || fact.valueText
  if (rawExcerpt !== provenance.excerpt) {
    errors.push(`${fact.factId}: ${anchorLabel} excerpt does not equal the raw source slice`)
  }
  if (normalized(rawMatch) !== normalized(sourceValueText)) {
    errors.push(`${fact.factId}: ${anchorLabel} match does not equal evidence sourceValueText`)
  }
  if (!sourceValueIsEquivalent(sourceValueText, fact.valueText)) {
    errors.push(`${fact.factId}: evidence sourceValueText is not equivalent to normalized fact valueText`)
  }
}

export function validateRawEvidence({ facts = [], snapshotsRoot, extractedPath }) {
  const errors = []
  const snapshots = new Map()
  const extracted = readJson(extractedPath)
  for (const source of extracted.records || []) {
    const snapshotPath = path.join(snapshotsRoot, source.sourceId, 'latest.json')
    if (fs.existsSync(snapshotPath)) snapshots.set(source.sourceId, readJson(snapshotPath))
  }

  let machineEvidence = 0
  let rawAnchoredEvidence = 0
  for (const fact of facts) {
    for (const provenance of fact.provenances || []) {
      if (provenance.origin === 'manifest_transcription') continue
      machineEvidence++
      const contextIndex = provenance.contextIndex
      if (contextIndex?.sourceOffsetsVerified !== true || !contextIndex?.sourceAnchor?.kind) {
        errors.push(`${fact.factId}: evidence is not anchored to a raw DOM/PDF source`)
        continue
      }

      if (provenance.origin === 'snapshot_page_text') {
        const snapshot = snapshots.get(provenance.sourceId)
        const rawText = snapshot?.rawDomText || ''
        if (!snapshot || snapshot.rawSnapshotVersion !== 'after-sales-raw-v2') {
          errors.push(`${fact.factId}: raw DOM snapshot is missing for ${provenance.sourceId}`)
          continue
        }
        if (snapshot.contentHash !== provenance.snapshotHash) {
          errors.push(`${fact.factId}: provenance snapshot hash does not match latest raw DOM snapshot`)
          continue
        }
        if (snapshot.rawDomTextHash !== sha256(rawText)
          || contextIndex.sourceAnchor.kind !== 'raw_dom_text'
          || contextIndex.sourceAnchor.textHash !== snapshot.rawDomTextHash) {
          errors.push(`${fact.factId}: raw DOM text hash/anchor mismatch`)
          continue
        }
        validateSlice({ fact, provenance, contextIndex, rawText, anchorLabel: 'raw DOM', errors })
        rawAnchoredEvidence++
        continue
      }

      if (provenance.origin === 'asset_text_extraction') {
        const source = extracted.records?.find(item => item.sourceId === provenance.sourceId)
        const asset = source?.assets?.find(item => item.url === provenance.assetUrl)
        const page = asset?.extraction?.pages?.find(item => item.pageNumber === provenance.pdfPage)
        const rawText = canonicalText(page?.text || '')
        const assetHash = asset?.verification?.contentHash || asset?.contentHash || null
        if (!asset || !page || !rawText) {
          errors.push(`${fact.factId}: raw PDF page text is missing for ${provenance.assetUrl} page ${provenance.pdfPage}`)
          continue
        }
        if (contextIndex.sourceAnchor.kind !== 'pdf_page_text'
          || contextIndex.sourceAnchor.assetHash !== assetHash) {
          errors.push(`${fact.factId}: raw PDF hash/anchor mismatch`)
          continue
        }
        validateSlice({ fact, provenance, contextIndex, rawText, anchorLabel: 'raw PDF page', errors })
        rawAnchoredEvidence++
        continue
      }

      errors.push(`${fact.factId}: unsupported machine evidence origin ${provenance.origin}`)
    }
  }

  return {
    machineEvidence,
    rawAnchoredEvidence,
    unverifiedEvidence: machineEvidence - rawAnchoredEvidence,
    errors,
    valid: errors.length === 0 && rawAnchoredEvidence === machineEvidence,
  }
}
