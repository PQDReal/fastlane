import type {
  KnowledgeEvidenceItem,
  KnowledgeVisualMediaPointer,
} from './retrieval/contracts'
import { extractDiagramLabels } from './diagram-labels'
import { isAllowedKnowledgeMediaUrl } from './media-url'
import { guardUntrustedKnowledgeText } from './untrusted-content'

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

  const exactSection = versionMatches.find((item) => (
    row.section_anchor && item.sectionAnchor === row.section_anchor
  ))
  if (exactSection) return exactSection.citationId

  const bySection = versionMatches.find((item) => {
    if (!row.section_anchor) return false
    return item.sectionAnchor.startsWith(`${row.section_anchor}#`)
      || item.sectionAnchor.startsWith(`${row.section_anchor}/`)
      || row.section_anchor.startsWith(`${item.sectionAnchor}#`)
      || row.section_anchor.startsWith(`${item.sectionAnchor}/`)
  })
  if (bySection) return bySection.citationId

  // Legacy occurrences may not have a section anchor. Only those rows may use
  // the broader source-node fallback; anchored sibling chunks must never share
  // a citation merely because they came from the same source node.
  if (!row.section_anchor && row.source_node_id) {
    const bySourceNode = versionMatches.find((item) => item.sourceNodeId === row.source_node_id)
    if (bySourceNode) return bySourceNode.citationId
  }

  return null
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
    if (!citationId || !isAllowedKnowledgeMediaUrl(row.source_url)) continue
    const safeTitle = guardUntrustedKnowledgeText(row.title)
    const safeSummary = guardUntrustedKnowledgeText(row.summary)
    if (!safeTitle.text || !safeSummary.text) continue
    seenAssets.add(row.asset_id)
    pointers.push({
      assetId: row.asset_id,
      annotationId: row.annotation_id,
      title: safeTitle.text,
      summary: safeSummary.text,
      alt: `${safeTitle.text} — ${row.image_type}`,
      url: row.source_url,
      mimeType: row.mime_type,
      width: row.width == null ? null : Number(row.width),
      height: row.height == null ? null : Number(row.height),
      safetyCritical: row.safety_critical === true,
      citationId,
      diagramLabels: safeSummary.blocked ? [] : extractDiagramLabels(safeSummary.text),
    })
  }

  return pointers
}
