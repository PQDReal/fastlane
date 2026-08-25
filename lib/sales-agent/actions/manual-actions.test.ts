import { beforeEach, describe, expect, it, vi } from 'vitest'

const manualApi = vi.hoisted(() => ({
  getManualArticle: vi.fn(),
  getManualModel: vi.fn(),
  getManualSearchIndex: vi.fn(),
}))

vi.mock('@/lib/api/manuals-server', () => manualApi)

import { fetchManualArticleAction } from './manual-actions'

describe('fetchManualArticleAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the dedicated contentful-article index used by the manual search box', async () => {
    manualApi.getManualArticle.mockResolvedValue({
      id: 'VF 5_2026_1200504',
      title: 'Cửa sổ điện',
      content_html: '<h2>Cửa sổ điện</h2>',
    })
    manualApi.getManualModel.mockResolvedValue({
      id: 'VF 5_2026',
      name: 'VF 5 2026',
      model_series: 'VF 5',
      year: '2026',
    })
    manualApi.getManualSearchIndex.mockResolvedValue([
      { id: 'VF 5_2026_1200504', title: 'Cửa sổ điện' },
      { id: 'VF 5_2026_1200780', title: 'Dừng và phanh xe' },
    ])

    await expect(fetchManualArticleAction('VF%205_2026', 'VF%205_2026_1200504')).resolves.toEqual({
      contentHtml: '<h2>Cửa sổ điện</h2>',
      modelName: 'VF 5',
      modelYear: '2026',
      articleTitle: 'Cửa sổ điện',
      searchData: [
        { id: 'VF 5_2026_1200504', title: 'Cửa sổ điện' },
        { id: 'VF 5_2026_1200780', title: 'Dừng và phanh xe' },
      ],
    })

    expect(manualApi.getManualSearchIndex).toHaveBeenCalledWith('VF 5_2026')
  })
})
