import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('VinFast manual ingestion gate', () => {
  const scriptPath = path.resolve('scripts/import-vinfast-manuals.mjs')
  const manifestPath = path.resolve('scripts/data/manual-corpus-allowlist.v1.json')

  it('keeps a tracked approved baseline manifest with the exact 29-edition scope', () => {
    expect(fs.existsSync(manifestPath)).toBe(true)
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

    expect(manifest.status).toBe('APPROVED_GATE_BASELINE')
    expect(manifest.expectedInventory).toMatchObject({
      manualEditions: 29,
      totalNodes: 1897,
      chapterNodes: 359,
      contentNodes: 1535,
      emptyLeafNodes: 3,
      imageReferences: 39977,
    })
    expect(manifest.selectedEditionIds).toHaveLength(29)
    expect(new Set(manifest.selectedEditionIds).size).toBe(29)
  })

  it('fails closed on manifest status, scope drift, and missing inventory assertions', () => {
    const script = fs.readFileSync(scriptPath, 'utf8')

    expect(script).toContain("manifest.status !== 'APPROVED_GATE_BASELINE'")
    expect(script).toContain('selectedEditionIds must exactly match')
    expect(script).toContain('expected.totalNodes')
    expect(script).toContain('expected.imageReferences')
    expect(script).toContain('MANUAL_CORPUS_MANIFEST_PATH')
  })
})
