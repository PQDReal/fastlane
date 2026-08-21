import assert from 'node:assert/strict'
import test from 'node:test'
import { auditSnapshotInventory } from './after-sales-snapshot-inventory.mjs'

const activeSource = {
  id: 'active-source',
  url: 'https://vinfastauto.com/vn_vi/active',
  relevancy: 'high',
  accuracy: 'source_verified',
}

const activeSnapshot = {
  snapshotId: 'active-source-2026-08-20',
  sourceId: 'active-source',
  sourceUrl: activeSource.url,
  capturedAt: '2026-08-20T00:00:00.000Z',
  captureMethod: 'brightdata_browser_api',
  httpStatus: 200,
  availability: 'available',
  rawSnapshotVersion: 'after-sales-raw-v2',
  rawDomTextHash: `sha256:${'a'.repeat(64)}`,
  rawDomHtmlHash: `sha256:${'b'.repeat(64)}`,
}

const excludedSnapshot = {
  snapshotId: 'excluded-source-2026-08-18',
  sourceId: 'excluded-source',
  sourceUrl: 'https://vinfastauto.com/vn_vi/excluded',
  capturedAt: '2026-08-18T00:00:00.000Z',
  httpStatus: 200,
  availability: 'available',
}

const baseInput = {
  manifest: { sources: [activeSource] },
  dispositions: {
    schemaVersion: 1,
    unknownSnapshotPolicy: 'reject',
    entries: [{
      sourceId: 'excluded-source',
      expectedUrl: excludedSnapshot.sourceUrl,
      disposition: 'excluded',
      reasonCode: 'OUT_OF_SCOPE',
      parsingEligible: false,
      publicationEligible: false,
      retainHistoricalSnapshots: true,
    }],
  },
  snapshotEntries: [
    { sourceId: activeSource.id, snapshot: activeSnapshot },
    { sourceId: excludedSnapshot.sourceId, snapshot: excludedSnapshot },
  ],
  verifiedRecords: [{
    sourceId: activeSource.id,
    sourceUrl: activeSource.url,
    snapshotId: activeSnapshot.snapshotId,
  }],
}

test('accepts active raw-v2 snapshots and explicitly excluded legacy snapshots', () => {
  const report = auditSnapshotInventory(baseInput)

  assert.equal(report.decision, 'PASS')
  assert.deepEqual(report.summary, {
    snapshotDirectories: 2,
    historicalFiles: 0,
    historicalVerifiedRawV2: 0,
    historicalLegacyCaptures: 0,
    failedAcquisitionAttempts: 0,
    historicalReassignedAliases: 0,
    newerRejectedAttempts: 0,
    newerEligibleNotSelected: 0,
    activeSources: 1,
    activeReady: 1,
    excluded: 1,
    superseded: 0,
    unknown: 0,
    verifiedRecords: 1,
    errors: 0,
    warnings: 0,
  })
})

test('accepts a newer rejected attempt without replacing the latest verified snapshot', () => {
  const report = auditSnapshotInventory({
    ...baseInput,
    snapshotEntries: baseInput.snapshotEntries.map(entry => entry.sourceId === activeSource.id
      ? {
          ...entry,
          history: [{
            fileName: 'active-source-failed.json',
            snapshot: {
              sourceId: activeSource.id,
              sourceUrl: activeSource.url,
              snapshotId: 'active-source-failed',
              capturedAt: '2026-08-20T01:00:00.000Z',
              captureMethod: 'manual_curated',
              availability: 'curated',
              acquisitionFailures: [{ provider: 'brightdata_browser_api' }],
            },
          }],
        }
      : entry),
  })

  assert.equal(report.decision, 'PASS')
  assert.equal(report.summary.failedAcquisitionAttempts, 1)
  assert.equal(report.summary.newerRejectedAttempts, 1)
  assert.equal(report.summary.newerEligibleNotSelected, 0)
})

test('rejects a newer raw-v2 snapshot that latest.json did not select', () => {
  const newerSnapshot = {
    ...activeSnapshot,
    snapshotId: 'active-source-2026-08-20-newer',
    capturedAt: '2026-08-20T01:00:00.000Z',
  }
  const report = auditSnapshotInventory({
    ...baseInput,
    snapshotEntries: baseInput.snapshotEntries.map(entry => entry.sourceId === activeSource.id
      ? { ...entry, history: [{ fileName: 'active-source-newer.json', snapshot: newerSnapshot }] }
      : entry),
  })

  assert.equal(report.decision, 'REJECT')
  assert.equal(report.summary.newerEligibleNotSelected, 1)
  assert.match(report.errors.join('\n'), /newer raw-v2 snapshot/)
})

test('accepts a declared historical URL after a source scope split', () => {
  const historicalUrl = 'https://vinfastauto.com/vn_vi/legacy-active'
  const canonicalSource = {
    id: 'canonical-source',
    url: historicalUrl,
    relevancy: 'high',
    accuracy: 'source_verified',
  }
  const canonicalSnapshot = {
    ...activeSnapshot,
    snapshotId: 'canonical-source-2026-08-20',
    sourceId: canonicalSource.id,
    sourceUrl: canonicalSource.url,
  }
  const report = auditSnapshotInventory({
    ...baseInput,
    manifest: { sources: [activeSource, canonicalSource] },
    dispositions: {
      ...baseInput.dispositions,
      historicalSourceUrlAliases: [{
        sourceId: activeSource.id,
        historicalUrl,
        canonicalSourceId: canonicalSource.id,
      }],
    },
    snapshotEntries: [
      {
        sourceId: activeSource.id,
        snapshot: activeSnapshot,
        history: [{
          fileName: 'active-source-legacy-url.json',
          snapshot: {
            ...activeSnapshot,
            snapshotId: 'active-source-legacy-url',
            sourceUrl: historicalUrl,
          },
        }],
      },
      { sourceId: canonicalSource.id, snapshot: canonicalSnapshot },
      baseInput.snapshotEntries[1],
    ],
    verifiedRecords: [
      ...baseInput.verifiedRecords,
      {
        sourceId: canonicalSource.id,
        sourceUrl: canonicalSource.url,
        snapshotId: canonicalSnapshot.snapshotId,
      },
    ],
  })

  assert.equal(report.decision, 'PASS')
  assert.equal(report.summary.historicalReassignedAliases, 1)
})

test('rejects an unclassified snapshot directory', () => {
  const report = auditSnapshotInventory({
    ...baseInput,
    snapshotEntries: [
      ...baseInput.snapshotEntries,
      {
        sourceId: 'unexpected-source',
        snapshot: { sourceId: 'unexpected-source', sourceUrl: 'https://vinfastauto.com/vn_vi/unexpected' },
      },
    ],
  })

  assert.equal(report.decision, 'REJECT')
  assert.equal(report.summary.unknown, 1)
  assert.match(report.errors.join('\n'), /unclassified snapshot directory/)
})

test('rejects excluded data leaking into the verified dataset', () => {
  const report = auditSnapshotInventory({
    ...baseInput,
    verifiedRecords: [
      ...baseInput.verifiedRecords,
      {
        sourceId: excludedSnapshot.sourceId,
        sourceUrl: excludedSnapshot.sourceUrl,
        snapshotId: excludedSnapshot.snapshotId,
      },
    ],
  })

  assert.equal(report.decision, 'REJECT')
  assert.match(report.errors.join('\n'), /leaked into verified dataset/)
})
