function uniqueById(items, label, errors) {
  const result = new Map()
  for (const item of items || []) {
    const id = String(item?.id || item?.sourceId || '').trim()
    if (!id) {
      errors.push(`${label}: missing source id`)
      continue
    }
    if (result.has(id)) {
      errors.push(`${label}: duplicate source id ${id}`)
      continue
    }
    result.set(id, item)
  }
  return result
}

function snapshotCheck(sourceId, entry, expectedUrl, errors) {
  const prefix = `${sourceId}:`
  if (!entry) {
    errors.push(`${prefix} missing snapshot directory or latest.json`)
    return null
  }
  if (entry.readError) {
    errors.push(`${prefix} cannot read latest.json (${entry.readError})`)
    return null
  }
  const snapshot = entry.snapshot
  if (!snapshot || typeof snapshot !== 'object') {
    errors.push(`${prefix} latest.json is not a JSON object`)
    return null
  }
  if (snapshot.sourceId !== sourceId) errors.push(`${prefix} latest snapshot sourceId mismatch`)
  if (expectedUrl && snapshot.sourceUrl !== expectedUrl) errors.push(`${prefix} latest snapshot sourceUrl mismatch`)
  return snapshot
}

const verifiedCaptureMethods = new Set([
  'http',
  'brightdata_browser_api',
  'browserless_playwright',
  'browserbase_playwright',
  'local_playwright',
])

function capturedTime(snapshot) {
  const value = Date.parse(snapshot?.capturedAt)
  return Number.isFinite(value) ? value : null
}

function classifyHistory(sourceId, entry, expectedUrl, latestSnapshot, historicalAliasByKey, errors) {
  const history = {
    files: 0,
    verifiedRawV2: 0,
    legacyCaptures: 0,
    failedAttempts: 0,
    reassignedLegacyIdentity: 0,
    newerRejectedAttempts: 0,
    newerEligibleNotSelected: 0,
    invalid: 0,
  }
  const latestTime = capturedTime(latestSnapshot)

  for (const historical of entry?.history || []) {
    history.files += 1
    if (historical.readError) {
      history.invalid += 1
      errors.push(`${sourceId}: cannot read historical snapshot ${historical.fileName} (${historical.readError})`)
      continue
    }
    const snapshot = historical.snapshot
    if (!snapshot || typeof snapshot !== 'object') {
      history.invalid += 1
      errors.push(`${sourceId}: historical snapshot ${historical.fileName} is not a JSON object`)
      continue
    }
    if (snapshot.sourceId !== sourceId) {
      history.invalid += 1
      errors.push(`${sourceId}: historical snapshot ${historical.fileName} sourceId mismatch`)
      continue
    }
    const historicalAlias = historicalAliasByKey.get(`${sourceId}|${snapshot.sourceUrl}`)
    if (expectedUrl && snapshot.sourceUrl !== expectedUrl && !historicalAlias) {
      history.invalid += 1
      errors.push(`${sourceId}: historical snapshot ${historical.fileName} sourceUrl mismatch`)
      continue
    }

    const historicalTime = capturedTime(snapshot)
    if (historicalTime === null) {
      history.invalid += 1
      errors.push(`${sourceId}: historical snapshot ${historical.fileName} has invalid capturedAt`)
      continue
    }
    if (historicalAlias) {
      history.reassignedLegacyIdentity += 1
      continue
    }
    const availableCapture = verifiedCaptureMethods.has(snapshot.captureMethod)
      && snapshot.httpStatus === 200
      && snapshot.availability === 'available'
    const rawV2 = availableCapture
      && snapshot.rawSnapshotVersion === 'after-sales-raw-v2'
      && Boolean(snapshot.rawDomTextHash)
      && Boolean(snapshot.rawDomHtmlHash)
    const rejectedAttempt = snapshot.captureMethod === 'manual_curated'
      || snapshot.latestRetained === true
      || (snapshot.availability !== 'available'
        && (snapshot.acquisitionFailureCount || (snapshot.acquisitionFailures || []).length) > 0)

    if (rawV2) {
      history.verifiedRawV2 += 1
      if (latestTime !== null && historicalTime > latestTime && snapshot.snapshotId !== latestSnapshot?.snapshotId) {
        history.newerEligibleNotSelected += 1
        errors.push(`${sourceId}: newer raw-v2 snapshot ${snapshot.snapshotId} is not selected by latest.json`)
      }
    } else if (availableCapture) {
      history.legacyCaptures += 1
    } else if (rejectedAttempt) {
      history.failedAttempts += 1
      if (latestTime !== null && historicalTime > latestTime) history.newerRejectedAttempts += 1
    } else {
      history.invalid += 1
      errors.push(`${sourceId}: historical snapshot ${historical.fileName} has an unknown state`)
    }
  }
  return history
}

export function auditSnapshotInventory({
  manifest,
  dispositions,
  snapshotEntries,
  verifiedRecords = [],
}) {
  const errors = []
  const warnings = []
  const activeById = uniqueById(manifest?.sources, 'manifest', errors)
  const dispositionById = uniqueById(dispositions?.entries, 'disposition', errors)
  const snapshotById = uniqueById(snapshotEntries, 'snapshot directory', errors)
  const verifiedById = uniqueById(verifiedRecords, 'verified dataset', errors)
  const active = []
  const excluded = []
  const superseded = []
  const unknown = []
  const historicalAliasByKey = new Map()

  if (dispositions?.schemaVersion !== 1) errors.push('disposition policy: unsupported schemaVersion')
  if (dispositions?.unknownSnapshotPolicy !== 'reject') {
    errors.push('disposition policy: unknownSnapshotPolicy must be reject')
  }
  for (const alias of dispositions?.historicalSourceUrlAliases || []) {
    const key = `${alias?.sourceId || ''}|${alias?.historicalUrl || ''}`
    if (!alias?.sourceId || !alias?.historicalUrl || historicalAliasByKey.has(key)) {
      errors.push(`historical source URL alias: missing or duplicate identity ${key}`)
      continue
    }
    const source = activeById.get(alias.sourceId)
    const canonical = activeById.get(alias.canonicalSourceId)
    if (!source) errors.push(`${alias.sourceId}: historical URL alias source is not active`)
    if (!canonical) errors.push(`${alias.sourceId}: historical URL alias canonical source is not active`)
    if (source?.url === alias.historicalUrl) errors.push(`${alias.sourceId}: historical URL alias still matches the active URL`)
    if (canonical && canonical.url !== alias.historicalUrl) {
      errors.push(`${alias.sourceId}: historical URL alias does not match canonical source ${alias.canonicalSourceId}`)
    }
    historicalAliasByKey.set(key, alias)
  }

  for (const [sourceId, disposition] of dispositionById) {
    if (activeById.has(sourceId)) errors.push(`${sourceId}: cannot be both active and dispositioned`)
    if (!['excluded', 'superseded'].includes(disposition.disposition)) {
      errors.push(`${sourceId}: unsupported disposition ${disposition.disposition || '(missing)'}`)
    }
    if (disposition.parsingEligible !== false || disposition.publicationEligible !== false) {
      errors.push(`${sourceId}: legacy snapshot must not be parsing/publication eligible`)
    }
  }

  for (const [sourceId, source] of activeById) {
    const snapshotEntry = snapshotById.get(sourceId)
    const snapshot = snapshotCheck(sourceId, snapshotEntry, source.url, errors)
    const history = classifyHistory(sourceId, snapshotEntry, source.url, snapshot, historicalAliasByKey, errors)
    const verified = verifiedById.get(sourceId)
    const item = {
      sourceId,
      sourceUrl: source.url,
      relevancy: source.relevancy || null,
      accuracy: source.accuracy || null,
      snapshotId: snapshot?.snapshotId || null,
      capturedAt: snapshot?.capturedAt || null,
      captureMethod: snapshot?.captureMethod || null,
      availability: snapshot?.availability || null,
      rawSnapshotVersion: snapshot?.rawSnapshotVersion || null,
      verifiedDatasetIncluded: Boolean(verified),
      history,
      status: 'ready',
    }

    if (source.relevancy !== 'high') errors.push(`${sourceId}: active source relevancy must be high`)
    if (source.accuracy !== 'source_verified') errors.push(`${sourceId}: active source accuracy must be source_verified`)
    if (snapshot) {
      if (snapshot.httpStatus !== 200 || snapshot.availability !== 'available') {
        errors.push(`${sourceId}: latest snapshot is unavailable`)
      }
      if (snapshot.rawSnapshotVersion !== 'after-sales-raw-v2') {
        errors.push(`${sourceId}: latest snapshot is not raw-v2 evidence eligible`)
      }
      if (!snapshot.rawDomTextHash || !snapshot.rawDomHtmlHash) {
        errors.push(`${sourceId}: latest snapshot is missing raw DOM hashes`)
      }
    }
    if (!verified) {
      errors.push(`${sourceId}: missing from verified dataset`)
    } else {
      if (verified.snapshotId !== snapshot?.snapshotId) errors.push(`${sourceId}: verified dataset does not use latest snapshot`)
      if (verified.sourceUrl !== source.url) errors.push(`${sourceId}: verified dataset sourceUrl mismatch`)
    }
    if (errors.some(message => message.startsWith(`${sourceId}:`))) item.status = 'invalid'
    active.push(item)
  }

  for (const [sourceId, entry] of snapshotById) {
    if (activeById.has(sourceId)) continue
    const disposition = dispositionById.get(sourceId)
    if (!disposition) {
      unknown.push({ sourceId, latestFile: entry.latestFile || null })
      errors.push(`${sourceId}: unclassified snapshot directory`)
      continue
    }
    const snapshot = snapshotCheck(sourceId, entry, disposition.expectedUrl, errors)
    const history = classifyHistory(sourceId, entry, disposition.expectedUrl, snapshot, historicalAliasByKey, errors)
    const item = {
      sourceId,
      sourceUrl: snapshot?.sourceUrl || disposition.expectedUrl || null,
      snapshotId: snapshot?.snapshotId || null,
      capturedAt: snapshot?.capturedAt || null,
      disposition: disposition.disposition,
      reasonCode: disposition.reasonCode || null,
      canonicalSourceId: disposition.canonicalSourceId || null,
      parsingEligible: false,
      publicationEligible: false,
      retained: disposition.retainHistoricalSnapshots === true,
      rawEvidenceEligible: snapshot?.rawSnapshotVersion === 'after-sales-raw-v2',
      history,
    }
    if (verifiedById.has(sourceId)) errors.push(`${sourceId}: excluded/superseded snapshot leaked into verified dataset`)

    if (disposition.disposition === 'superseded') {
      const canonical = activeById.get(disposition.canonicalSourceId)
      if (!canonical) {
        errors.push(`${sourceId}: canonical source ${disposition.canonicalSourceId || '(missing)'} is not active`)
      } else if (canonical.url !== disposition.expectedUrl) {
        errors.push(`${sourceId}: canonical source URL differs from legacy URL`)
      }
      superseded.push(item)
    } else {
      excluded.push(item)
    }
  }

  for (const sourceId of verifiedById.keys()) {
    if (!activeById.has(sourceId)) errors.push(`${sourceId}: verified dataset contains a non-active source`)
  }

  const allHistory = [...active, ...excluded, ...superseded].map(item => item.history)
  const historyTotal = field => allHistory.reduce((sum, history) => sum + (history?.[field] || 0), 0)
  const summary = {
    snapshotDirectories: snapshotById.size,
    historicalFiles: historyTotal('files'),
    historicalVerifiedRawV2: historyTotal('verifiedRawV2'),
    historicalLegacyCaptures: historyTotal('legacyCaptures'),
    failedAcquisitionAttempts: historyTotal('failedAttempts'),
    historicalReassignedAliases: historyTotal('reassignedLegacyIdentity'),
    newerRejectedAttempts: historyTotal('newerRejectedAttempts'),
    newerEligibleNotSelected: historyTotal('newerEligibleNotSelected'),
    activeSources: activeById.size,
    activeReady: active.filter(item => item.status === 'ready').length,
    excluded: excluded.length,
    superseded: superseded.length,
    unknown: unknown.length,
    verifiedRecords: verifiedById.size,
    errors: errors.length,
    warnings: warnings.length,
  }

  return {
    auditorVersion: 'after-sales-snapshot-inventory-v1',
    summary,
    active,
    excluded,
    superseded,
    unknown,
    errors,
    warnings,
    decision: errors.length ? 'REJECT' : warnings.length ? 'REVIEW' : 'PASS',
  }
}
