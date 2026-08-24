import { describe, expect, it } from 'vitest'

import { inferManualModelSeries } from './manual-model-resolver'

describe('manual model resolver', () => {
  const series = ['VF 5', 'VF 8', 'Klara S', 'Klara S2', 'Evo 200', 'Evo 200 Lite']

  it('uses the longest exact model series present in the user query', () => {
    expect(inferManualModelSeries('Hướng dẫn sử dụng Klara S2', series)).toBe('Klara S2')
    expect(inferManualModelSeries('Cổng sạc của Evo200 Lite ở đâu?', series)).toBe('Evo 200 Lite')
  })

  it('does not infer a different model from a generic manual request', () => {
    expect(inferManualModelSeries('Cho tôi xem hướng dẫn sử dụng xe', series)).toBeUndefined()
  })
})
