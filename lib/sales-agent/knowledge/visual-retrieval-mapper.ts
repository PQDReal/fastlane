import type {
  KnowledgeEvidenceItem,
  KnowledgeVisualMediaPointer,
} from './retrieval/contracts'

export type ApprovedVisualRow = {
  asset_id: string
  annotation_id: string
  version_id: string
  source_node_id: string | null
  section_anchor: string | null
  source_url: string
  title: string
  summary: string
  image_type: string
  mime_type: string
  width: number | null
  height: number | null
  safety_critical: boolean
}

function findCitationId(
  row: ApprovedVisualRow,
  evidenceItems: KnowledgeEvidenceItem[],
): string | null {
  const versionMatches = evidenceItems.filter((item) => item.knowledgeVersionId === row.version_id)
  if (versionMatches.length === 0) return null

  const exact = versionMatches.find((item) => (
    row.source_node_id && item.sourceNodeId === row.source_node_id
  ))
  if (exact) return exact.citationId

  const bySection = versionMatches.find((item) => {
    if (!row.section_anchor) return false
    const cleanItemAnchor = item.sectionAnchor.replace(/-p\d+$/, '')
    const cleanRowAnchor = row.section_anchor.replace(/-p\d+$/, '')
    return cleanItemAnchor === cleanRowAnchor
      || item.sectionAnchor.startsWith(row.section_anchor)
      || row.section_anchor.startsWith(item.sectionAnchor)
  })
  if (bySection) return bySection.citationId

  return versionMatches[0]?.citationId || null
}

export function mapApprovedVisualRowsToPointers(
  rows: ApprovedVisualRow[],
  evidenceItems: KnowledgeEvidenceItem[],
): KnowledgeVisualMediaPointer[] {
  const seenAssets = new Set<string>()
  const pointers: KnowledgeVisualMediaPointer[] = []

  for (const row of rows) {
    if (seenAssets.has(row.asset_id)) continue
    const citationId = findCitationId(row, evidenceItems)
    if (!citationId || !row.source_url) continue
    seenAssets.add(row.asset_id)
    pointers.push({
      assetId: row.asset_id,
      annotationId: row.annotation_id,
      title: row.title,
      summary: row.summary,
      alt: `${row.title} — ${row.image_type}`,
      url: row.source_url,
      mimeType: row.mime_type,
      width: row.width == null ? null : Number(row.width),
      height: row.height == null ? null : Number(row.height),
      safetyCritical: row.safety_critical === true,
      citationId,
    })
  }

  return pointers
}
