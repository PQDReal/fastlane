export function planVisualAnnotationInserts({
  annotations,
  assetIdByHash,
  existingAnnotations,
}) {
  const revisionsByAsset = new Map()
  for (const row of existingAnnotations) {
    const list = revisionsByAsset.get(row.asset_id) || []
    list.push(row)
    revisionsByAsset.set(row.asset_id, list)
  }

  const inserts = []
  let reused = 0
  for (const row of annotations) {
    const assetId = assetIdByHash.get(row.assetSha256)
    if (!assetId) throw new Error(`Canonical asset ID missing for ${row.assetSha256}`)
    const revisions = revisionsByAsset.get(assetId) || []
    if (revisions.some((revision) => revision.content_hash === row.contentHash)) {
      reused++
      continue
    }
    const insert = {
      asset_id: assetId,
      revision_no: revisions.reduce((max, revision) => Math.max(max, revision.revision_no), 0) + 1,
      status: 'AI_DRAFT',
      decision: row.decision,
      image_type: row.imageType,
      title: row.title,
      summary: row.summary,
      keywords: row.keywords,
      visible_text: row.visibleText,
      relations: row.relations,
      confidence: row.confidence,
      retrieval_recommendation: row.retrievalRecommendation,
      safety_critical: row.safetyCritical,
      content_hash: row.contentHash,
      source_asset_sha256: row.sourceAssetSha256,
      source_packet_id: row.sourcePacketId,
      vision_provider: row.visionProvider,
      model_id: row.modelId,
      request_id: row.requestId,
      prompt_hash: row.promptHash,
      provenance: row.provenance,
    }
    inserts.push(insert)
    revisions.push(insert)
    revisionsByAsset.set(assetId, revisions)
  }

  return { inserts, reused }
}
