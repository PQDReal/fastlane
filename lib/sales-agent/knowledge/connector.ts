import type { DocumentTreeInput, SectionNodeInput } from './hierarchical-chunker.ts'

export interface ManualEditionMetadata {
  editionId: string
  vehicleKey: string
  vehicleModel: string
  modelYear: number
  locale: string
  market: string
  canonicalDocumentKey: string
  title: string
  category: string
}

export interface RawStagingNode {
  id: string
  originalId: string
  modelId: string
  title: string
  slug: string
  contentMarkdown?: string
  contentHtml?: string
  contentText?: string
  level: number
  parentId?: string | null
  orderIndex: number
}

export interface ManualMarkdownSection {
  chapterTitle: string
  sectionTitle: string
  sectionId: string
  filePath: string
  contentMarkdown: string
  images?: string[]
}

// Planning/code-ready allowlist v2 (D-019-021). This does not authorize a live import.
export const APPROVED_31_MANUAL_EDITIONS: readonly string[] = [
  'VF e34_2021',
  'VF e34_2022',
  'VF e34_2023',
  'VF e34_2024',
  'VF 3_2024',
  'VF 3_2025',
  'VF 3_2026',
  'VF 5_2023',
  'VF 5_2024',
  'VF 5_2025',
  'VF 5_2026',
  'VF 6_2023',
  'VF 6_2024',
  'VF 6_2025',
  'VF 6_2026',
  'VF 7_2024',
  'VF 7_2025',
  'VF 7_2026',
  'VF 8_2022',
  'VF 8_2023',
  'VF 8_2024',
  'VF 8_2025',
  'VF 8_2026',
  'VF 8 - MY26_2026',
  'VF 9_2023',
  'VF 9_2024',
  'VF 9_2025',
  'VF 9_2026',
  'VF MPV 7_2026',
  'Lạc Hồng 900 LX_2025',
  'Lạc Hồng 900 LX_2026',
] as const

export function canonicalizeVehicleModel(model: string): string {
  const trimmed = model.trim().replace(/\s+/g, ' ')
  const ascii = trimmed
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()

  if (ascii === 'lac hong 900 lx') return 'Lạc Hồng 900 LX'
  return trimmed
}

export function toVehicleKey(model: string): string {
  return canonicalizeVehicleModel(model)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function parseEditionId(editionId: string): {
  vehicleKey: string
  vehicleModel: string
  modelYear: number
  canonicalDocumentKey: string
} {
  const separator = editionId.lastIndexOf('_')
  if (separator <= 0) throw new Error(`Invalid manual edition id '${editionId}'`)

  const modelRaw = editionId.slice(0, separator).trim()
  const yearRaw = editionId.slice(separator + 1).trim()
  if (!/^20\d{2}$/.test(yearRaw)) throw new Error(`Invalid model year in edition id '${editionId}'`)

  const vehicleModel = canonicalizeVehicleModel(modelRaw)
  const vehicleKey = toVehicleKey(vehicleModel)
  const modelYear = Number(yearRaw)

  return {
    vehicleKey,
    vehicleModel,
    modelYear,
    canonicalDocumentKey: `vinfast:${vehicleKey}:${modelYear}:vi-VN`,
  }
}

function toDocumentTree(
  editionId: string,
  sections: SectionNodeInput[],
): DocumentTreeInput {
  if (!APPROVED_31_MANUAL_EDITIONS.includes(editionId)) {
    throw new Error(`Edition '${editionId}' is not in the code-ready 31-edition allowlist (D-019-021)`)
  }

  const { vehicleKey, vehicleModel, modelYear, canonicalDocumentKey } = parseEditionId(editionId)
  return {
    documentKey: canonicalDocumentKey,
    title: `Sổ tay hướng dẫn sử dụng VinFast ${vehicleModel} (${modelYear})`,
    category: 'TECHNICAL_GUIDE',
    vehicleKey,
    vehicleModel,
    modelYear,
    locale: 'vi-VN',
    market: 'VN',
    sections,
  }
}

export class VinFastManualMarkdownConnector {
  isEditionSelected(editionId: string): boolean {
    return APPROVED_31_MANUAL_EDITIONS.includes(editionId)
  }

  getSelectedEditionsInventory(): ManualEditionMetadata[] {
    return APPROVED_31_MANUAL_EDITIONS.map((editionId) => {
      const parsed = parseEditionId(editionId)
      return {
        editionId,
        vehicleKey: parsed.vehicleKey,
        vehicleModel: parsed.vehicleModel,
        modelYear: parsed.modelYear,
        locale: 'vi-VN',
        market: 'VN',
        canonicalDocumentKey: parsed.canonicalDocumentKey,
        title: `Sổ tay hướng dẫn sử dụng VinFast ${parsed.vehicleModel} (${parsed.modelYear})`,
        category: 'TECHNICAL_GUIDE',
      }
    })
  }

  transformMarkdownSectionsToDocumentTree(
    editionId: string,
    markdownSections: ManualMarkdownSection[],
  ): DocumentTreeInput {
    const seenNodeIds = new Set<string>()
    const sections: SectionNodeInput[] = []

    for (const section of markdownSections) {
      const content = section.contentMarkdown.trim()
      if (!content) continue
      const sourceNodeId = String(section.sectionId || '').trim()
      if (!sourceNodeId) throw new Error(`Section '${section.filePath}' has no stable section id`)
      if (seenNodeIds.has(sourceNodeId)) {
        throw new Error(`Duplicate source node id '${sourceNodeId}' in edition '${editionId}'`)
      }
      seenNodeIds.add(sourceNodeId)
      sections.push({
        chapterTitle: section.chapterTitle,
        sectionTitle: section.sectionTitle,
        slug: section.filePath.replace(/\\/g, '/'),
        contentMarkdown: content,
        sourceNodeId,
      })
    }

    return toDocumentTree(editionId, sections)
  }
}

/**
 * Transitional read-only connector for legacy manual_articles reconciliation.
 * New ingestion must use VinFastManualMarkdownConnector.
 */
export class VinFastManualStagingConnector {
  isEditionApproved(editionId: string): boolean {
    return APPROVED_31_MANUAL_EDITIONS.includes(editionId)
  }

  getApprovedEditionsInventory(): ManualEditionMetadata[] {
    return new VinFastManualMarkdownConnector().getSelectedEditionsInventory()
  }

  transformStagingNodesToDocumentTree(
    editionId: string,
    rawNodes: RawStagingNode[],
  ): DocumentTreeInput {
    if (!this.isEditionApproved(editionId)) {
      throw new Error(`Edition '${editionId}' is not in the code-ready 31-edition allowlist (D-019-021)`)
    }

    const nodeMap = new Map<string, RawStagingNode>()
    rawNodes.forEach((node) => nodeMap.set(node.id, node))

    const sections: SectionNodeInput[] = []
    for (const node of [...rawNodes].sort((a, b) => a.orderIndex - b.orderIndex)) {
      const content = (node.contentHtml || node.contentMarkdown || node.contentText || '').trim()
      if (!content || content.length < 5) continue
      const chapterTitle = node.parentId && nodeMap.has(node.parentId)
        ? nodeMap.get(node.parentId)!.title
        : 'Hướng dẫn kỹ thuật chung'
      sections.push({
        chapterTitle,
        sectionTitle: node.title,
        slug: node.slug,
        contentMarkdown: content,
        sourceNodeId: String(node.originalId || node.id),
      })
    }

    return toDocumentTree(editionId, sections)
  }
}
