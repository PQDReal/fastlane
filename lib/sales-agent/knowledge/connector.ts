import type { DocumentTreeInput, SectionNodeInput } from './hierarchical-chunker'

export interface ManualEditionMetadata {
  editionId: string
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

// 29 Canonical Editions Allowlist (D-019-019)
export const APPROVED_29_MANUAL_EDITIONS: readonly string[] = [
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
] as const

export function parseEditionId(editionId: string): {
  vehicleModel: string
  modelYear: number
  canonicalDocumentKey: string
} {
  const parts = editionId.split('_')
  const modelRaw = parts[0]?.trim() || 'VF'
  const yearRaw = parseInt(parts[1] || '2025', 10)
  const cleanModelKey = modelRaw.replace(/\s+/g, '').replace(/-/g, '_')
  const canonicalDocumentKey = `vinfast:${cleanModelKey}:${yearRaw}:vi-VN`

  return {
    vehicleModel: modelRaw,
    modelYear: yearRaw,
    canonicalDocumentKey,
  }
}

export class VinFastManualStagingConnector {
  /**
   * Kiểm tra một edition ID có nằm trong 29 allowlist hợp lệ không
   */
  isEditionApproved(editionId: string): boolean {
    return APPROVED_29_MANUAL_EDITIONS.includes(editionId)
  }

  /**
   * Lấy danh sách 29 manual allowlist metadata
   */
  getApprovedEditionsInventory(): ManualEditionMetadata[] {
    return APPROVED_29_MANUAL_EDITIONS.map((edId) => {
      const { vehicleModel, modelYear, canonicalDocumentKey } = parseEditionId(edId)
      return {
        editionId: edId,
        vehicleModel,
        modelYear,
        locale: 'vi-VN',
        market: 'VN',
        canonicalDocumentKey,
        title: `Sổ tay hướng dẫn sử dụng VinFast ${vehicleModel} (${modelYear})`,
        category: 'TECHNICAL_GUIDE',
      }
    })
  }

  /**
   * Chuyển đổi cây nodes từ raw staging sang canonical DocumentTreeInput
   */
  transformStagingNodesToDocumentTree(
    editionId: string,
    rawNodes: RawStagingNode[]
  ): DocumentTreeInput {
    if (!this.isEditionApproved(editionId)) {
      throw new Error(`Edition '${editionId}' is not in the approved 29 manual allowlist (D-019-019)`)
    }

    const { vehicleModel, modelYear, canonicalDocumentKey } = parseEditionId(editionId)

    // Tạo map để tra cứu chapter title theo parentId
    const nodeMap = new Map<string, RawStagingNode>()
    rawNodes.forEach((n) => nodeMap.set(n.id, n))

    const sections: SectionNodeInput[] = []

    // Sắp xếp nodes theo orderIndex
    const sortedNodes = [...rawNodes].sort((a, b) => a.orderIndex - b.orderIndex)

    for (const node of sortedNodes) {
      // Bỏ qua node root level 0 hoặc chapter level 1 chỉ là tiêu đề không có nội dung text
      const content = (node.contentHtml || node.contentMarkdown || node.contentText || '').trim()
      if (!content || content.length < 5) continue

      let chapterTitle = 'Hướng dẫn kỹ thuật chung'
      if (node.parentId && nodeMap.has(node.parentId)) {
        chapterTitle = nodeMap.get(node.parentId)!.title
      }

      sections.push({
        chapterTitle,
        sectionTitle: node.title,
        slug: node.slug,
        contentMarkdown: content,
        sourceNodeId: String(node.originalId || node.id),
      })
    }

    return {
      documentKey: canonicalDocumentKey,
      title: `Sổ tay hướng dẫn sử dụng VinFast ${vehicleModel} (${modelYear})`,
      category: 'TECHNICAL_GUIDE',
      vehicleModel,
      modelYear,
      sections,
    }
  }
}
