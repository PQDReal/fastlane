import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { parseFrontmatter } from './lib/vinfast-knowledge-build.mjs'

describe('VinFast Markdown knowledge build gate', () => {
  const manifestPath = path.resolve('scripts/data/manual-corpus-allowlist.v2.json')

  it('tracks exactly 31 code-ready editions without claiming live approval', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    expect(manifest.status).toBe('CODE_READY_NOT_APPROVED_FOR_LIVE')
    expect(manifest.approvedAt).toBeNull()
    expect(manifest.selectedEditionIds).toHaveLength(31)
    expect(new Set(manifest.selectedEditionIds).size).toBe(31)
    expect(manifest.expectedInventory).toMatchObject({
      manualEditions: 31,
      totalNodes: 2017,
      chapterNodes: 381,
      sectionNodes: 1636,
      contentNodes: 1633,
      emptyLeafNodes: 3,
      retainedImageOccurrences: 9043,
    })
  })

  it('strips frontmatter and crawl boilerplate before chunking', () => {
    const parsed = parseFrontmatter(`---\nmodel: "VF 8"\nsection_id: 1\n---\n# Sạc\n\n*Thuộc chương: Pin | Xe: VF 8*\n\nNội dung.`)
    expect(parsed.attributes.model).toBe('VF 8')
    expect(parsed.body).toContain('# Sạc')
    expect(parsed.body).toContain('Nội dung.')
    expect(parsed.body).not.toContain('Thuộc chương:')
  })

  it('keeps OpenAI and Supabase execution behind explicit flags', () => {
    const embedScript = fs.readFileSync(path.resolve('scripts/embed-vinfast-knowledge.mjs'), 'utf8')
    const adapter = fs.readFileSync(path.resolve('lib/sales-agent/knowledge/embedding-adapter.ts'), 'utf8')
    expect(embedScript).toContain("process.argv.includes('--execute')")
    expect(embedScript).toContain("KNOWLEDGE_EMBED_APPROVED !== 'YES'")
    expect(embedScript).toContain('OPENAI_EMBEDDING_MODEL')
    expect(adapter).toContain("OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small'")
  })
})
