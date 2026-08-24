import { describe, expect, it } from 'vitest'
import type { FusedCandidate } from './rrf-fusion'
import { rerankFusedCandidates } from './reranker'

function candidate(
  chunkId: string,
  sectionTitle: string,
  content: string,
  rrfScore: number,
): FusedCandidate {
  return {
    chunkId,
    documentId: 'doc-vf5-2025',
    documentKey: 'vinfast:manual:VF5:2025:vi-VN',
    versionId: 'ver-vf5-2025',
    versionNo: 1,
    indexGenerationId: 'openai-text-embedding-3-small-512-v1',
    chunkLevel: 3,
    hierarchyPath: sectionTitle.toLowerCase().replace(/\s+/g, '_'),
    sectionAnchor: chunkId,
    sectionTitle,
    content,
    contentHash: `hash-${chunkId}`,
    tokenCount: Math.ceil(content.length / 4),
    tags: ['VF 5'],
    title: 'Sổ tay hướng dẫn sử dụng VinFast VF 5',
    slug: 'vinfast-vf5-2025',
    category: 'TECHNICAL_GUIDE',
    effectiveFrom: '2025-01-01T00:00:00.000Z',
    effectiveTo: null,
    publicationStatus: 'PUBLISHED',
    indexStatus: 'READY',
    rrfScore,
  }
}

describe('Knowledge deterministic reranker', () => {
  it('promotes an inherited function heading for a paraphrased button query', () => {
    const candidates = [
      candidate(
        'vf5-wheel-part1',
        'Lái xe > Vô lăng (Phần 1)',
        'Điều chỉnh vị trí vô lăng và khoảng cách với người lái.',
        0.035,
      ),
      candidate(
        'vf5-wheel-part2',
        'Lái xe > Vô lăng > Các phím chức năng (Phần 2)',
        '| Nhấn nhanh | Menu bên trái |\n| Nhấn và giữ | Kiểm soát hành trình BẬT/TẮT |',
        0.027,
      ),
      candidate(
        'vf5-wheel-part3',
        'Lái xe > Vô lăng > Các phím âm lượng (Phần 3)',
        'Tăng giảm âm lượng và xác nhận lựa chọn trên màn hình.',
        0.030,
      ),
    ]

    const ranked = rerankFusedCandidates('các nút và tính năng trên vô lăng VF 5', candidates, { limit: 3 })

    expect(ranked[0].chunkId).toBe('vf5-wheel-part2')
    expect(ranked).toHaveLength(3)
    expect(ranked[0].rerankScore).toBeGreaterThan(ranked[1].rerankScore)
  })

  it('keeps the sparse table section ahead of the explanatory sibling section', () => {
    const ranked = rerankFusedCandidates('các nút và tính năng trên vô lăng VF 5', [
      candidate(
        'vf5-real-part1',
        'Lái xe > Vô lăng > Các phím chức năng (Phần 1)',
        'Một số tính năng điều khiển xe và Thông tin giải trí có thể được điều khiển bằng các phím trên vô lăng mà không cần sử dụng màn hình Thông tin giải trí.',
        0.035,
      ),
      candidate(
        'vf5-real-part2',
        'Lái xe > Vô lăng > Các phím chức năng (Phần 2)',
        '| | Nhấn nhanh | Menu bên trái |\n| --- | --- | --- |\n| | Nhấn và giữ | Kiểm soát hành trình BẬT/TẮT |\n| | Nhấn nhanh | Cài đặt tốc độ của kiểm soát hành trình (+) |\n| | Nhấn nhanh | Xác nhận (OK) |',
        0.027,
      ),
      candidate(
        'vf5-real-part3',
        'Lái xe > Vô lăng > Các phím chức năng (Phần 3)',
        'Hãy đọc tất cả các phần liên quan trong Sổ tay Hướng dẫn Sử dụng và làm quen với tất cả các điều khiển trên vô lăng trước khi lái xe.',
        0.030,
      ),
    ], { limit: 3 })

    expect(ranked[0].chunkId).toBe('vf5-real-part2')
  })

  it('is deterministic and never returns more than the requested candidate limit', () => {
    const candidates = Array.from({ length: 12 }, (_, index) => candidate(
      `chunk-${String(index).padStart(2, '0')}`,
      `Lái xe > Mục ${index}`,
      `Nội dung hướng dẫn VF 5 cho mục ${index}.`,
      0.03 - index / 1000,
    ))

    const first = rerankFusedCandidates('hướng dẫn VF 5', candidates, { limit: 5 })
    const second = rerankFusedCandidates('hướng dẫn VF 5', candidates, { limit: 5 })

    expect(first).toHaveLength(5)
    expect(first.map((item) => item.chunkId)).toEqual(second.map((item) => item.chunkId))
  })
})
