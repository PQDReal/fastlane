import { describe, expect, it } from 'vitest'

import { extractDiagramLabels } from './diagram-labels'

describe('diagram label extraction', () => {
  it('extracts every explicit marker and ignores range preambles', () => {
    const summary = 'Các bộ phận được đánh số từ (1) đến (4) bao gồm: (1) Nắp che cổng sạc bên ngoài đang mở; (2) Đèn LED báo trạng thái sạc; (3) Hốc cổng sạc trên thân xe; (4) Súng sạc đang cắm vào xe.'

    expect(extractDiagramLabels(summary)).toEqual([
      { marker: '1', description: 'Nắp che cổng sạc bên ngoài đang mở' },
      { marker: '2', description: 'Đèn LED báo trạng thái sạc' },
      { marker: '3', description: 'Hốc cổng sạc trên thân xe' },
      { marker: '4', description: 'Súng sạc đang cắm vào xe.' },
    ])
  })

  it('does not invent markers absent from the source', () => {
    expect(extractDiagramLabels('Sơ đồ có (1) Nắp cổng sạc.')).toEqual([
      { marker: '1', description: 'Nắp cổng sạc.' },
    ])
  })

  it('extracts conservative textual markers and ignores measurements', () => {
    expect(extractDiagramLabels(
      'Màn hình Âm lượng, đánh số 6 chỉ thanh trượt Dẫn đường (Navigation) và số 7 chỉ thanh trượt Nhạc/Giải trí (Media).',
    )).toEqual([
      { marker: '6', description: 'thanh trượt Dẫn đường (Navigation)' },
      { marker: '7', description: 'thanh trượt Nhạc/Giải trí (Media).' },
    ])

    expect(extractDiagramLabels('Màn hình hiển thị áp suất lốp 47 psi màu vàng.')).toEqual([])
  })
})
