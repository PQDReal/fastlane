import fs from 'node:fs'
import path from 'node:path'
import { stableAssetId, stableEvidenceId, defaultApproval } from './after-sales-approval.mjs'

export const REVIEW_DATASET_SCHEMA_VERSION = 6

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function assetLookup(verified) {
  const index = new Map()
  for (const source of verified.records || []) {
    for (const asset of source.assets || []) {
      const contentHash = asset.contentHash || asset.verification?.contentHash || null
      index.set(`${source.sourceId}|${asset.url}|${contentHash || ''}`, {
        assetId: stableAssetId({ sourceId: source.sourceId, url: asset.url, contentHash: contentHash || '' }),
        sourceId: source.sourceId,
        url: asset.url,
        type: asset.type,
        label: asset.label || null,
        contentHash,
        mimeType: asset.verification?.detectedType || asset.verification?.declaredType || null,
        byteLength: asset.verification?.byteLength || null,
        classification: asset.classification || null,
        verification: asset.verification || null,
      })
    }
  }
  return index
}

export function buildReviewDataset({ normalized, verified, manifest, existing = null, generatedAt = new Date().toISOString() }) {
  const sourceById = new Map((manifest.sources || []).map(source => [source.id, source]))
  const verifiedById = new Map((verified.records || []).map(source => [source.sourceId, source]))
  const assets = assetLookup(verified)
  const existingByFactId = new Map((existing?.facts || []).map(fact => [fact.factId, fact]))
  const sources = (manifest.sources || []).map(source => {
    const snapshot = verifiedById.get(source.id)
    return {
      sourceId: source.id,
      sourceUrl: source.url,
      serviceType: source.serviceType,
      vehicleType: source.vehicleType,
      scope: source.scope,
      title: snapshot?.title || source.id,
      snapshotId: snapshot?.snapshotId || null,
      snapshotHash: snapshot?.contentHash || null,
      capturedAt: snapshot?.capturedAt || null,
      captureMethod: snapshot?.captureMethod || null,
      httpStatus: snapshot?.httpStatus || null,
      availability: snapshot?.availability || null,
    }
  })

  const facts = (normalized.facts || []).map(fact => {
    const previous = existingByFactId.get(fact.factId)
    const evidence = (fact.provenances || []).map(provenance => {
        const asset = provenance.assetUrl
          ? assets.get(`${provenance.sourceId}|${provenance.assetUrl}|${provenance.assetHash || ''}`) || null
          : null
      return {
        evidenceId: stableEvidenceId(provenance),
        origin: provenance.origin,
        sourceId: provenance.sourceId,
        sourceUrl: provenance.sourceUrl,
        snapshotHash: provenance.snapshotHash || null,
        capturedAt: provenance.capturedAt || null,
        assetId: asset?.assetId || null,
        assetUrl: provenance.assetUrl || null,
        assetHash: provenance.assetHash || null,
        pdfPage: provenance.pdfPage ?? null,
        extractionMethod: provenance.extractionMethod || null,
        extractionConfidence: provenance.extractionConfidence ?? null,
        sourceValueText: provenance.sourceValueText || fact.valueText,
        excerpt: provenance.excerpt,
        contextIndex: provenance.contextIndex || null,
        asset: asset || null,
      }
    })
    return {
      factId: fact.factId,
      factGroupId: fact.factGroupId,
      canonicalKey: fact.canonicalKey,
      sourceId: fact.sourceId,
      sourceIds: fact.sourceIds,
      serviceType: fact.serviceType,
      vehicleType: fact.vehicleType,
      powertrain: fact.powertrain || 'all',
      model: fact.model,
      subject: fact.subject,
      policyEntity: fact.policyEntity,
      batteryChemistry: fact.batteryChemistry || 'not_applicable',
      usageCondition: fact.usageCondition,
      applicability: fact.applicability,
      action: fact.action,
      factType: fact.factType,
      valueNumeric: fact.valueNumeric,
      valueText: fact.valueText,
      unit: fact.unit,
      qualifier: fact.qualifier,
      intervalRelation: fact.intervalRelation || null,
      intervalGroupId: fact.intervalGroupId || null,
      intervalGroupDistancePolicy: fact.intervalGroupDistancePolicy || null,
      distancePolicy: fact.distancePolicy || 'not_stated',
      confidence: fact.confidence,
      sourceReviewStatus: fact.reviewStatus,
      reviewReasons: [...new Set(fact.reviewReasons || [])],
      publicationStatus: fact.publicationStatus || 'review_required',
      supersedesFactIds: [...new Set(fact.supersedesFactIds || [])],
      sourceFactGroupIds: [...new Set(fact.sourceFactGroupIds || [])],
      alternativeTriggers: structuredClone(fact.alternativeTriggers || []),
      semanticFlags: [...new Set(fact.semanticFlags || [])],
      groupSemanticFlags: [...new Set(fact.groupSemanticFlags || [])],
      evidenceCount: evidence.length,
      approval: defaultApproval(previous?.approval),
      evidence,
    }
  })

  return {
    schemaVersion: REVIEW_DATASET_SCHEMA_VERSION,
    generatedAt,
    purpose: 'human_fact_review_only',
    sourceCount: sources.length,
    assetCount: assets.size,
    factCount: facts.length,
    evidenceCount: facts.reduce((sum, fact) => sum + fact.evidence.length, 0),
    pendingCount: facts.filter(fact => fact.approval.status === 'pending').length,
    approvedCount: facts.filter(fact => fact.approval.status === 'approved').length,
    rejectedCount: facts.filter(fact => fact.approval.status === 'rejected').length,
    sources,
    assets: [...assets.values()],
    facts,
  }
}

export function buildReviewDatasetFromFiles({ root, existingPath = null, normalizedPath = null }) {
  const existing = existingPath && fs.existsSync(existingPath) ? readJson(existingPath) : null
  const normalized = readJson(normalizedPath || path.join(root, 'public/data/after-sales-normalized.json'))
  if (normalized.schemaVersion === 6
    && (normalized.normalizationBasis?.rawCorpusAvailable !== true
      || normalized.publicationStatus !== 'pending_admin_approval')) {
    throw new Error('V6 review dataset is blocked until raw DOM/PDF evidence is fully anchored and publicationStatus is pending_admin_approval')
  }
  return buildReviewDataset({
    normalized,
    verified: readJson(path.join(root, 'public/data/after-sales-verified.json')),
    manifest: readJson(path.join(root, 'scripts/data/after-sales-source-manifest.json')),
    existing,
  })
}
