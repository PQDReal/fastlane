import { describe, expect, it } from 'vitest'

import { getVisibleSalesAgentInteractionOptions } from './interaction-view'

const options = Array.from({ length: 8 }, (_, index) => ({ optionId: `option-${index + 1}`, label: `VF ${index + 1}` }))

describe('sales agent compact interaction view', () => {
  it('shows four options by default', () => {
    expect(getVisibleSalesAgentInteractionOptions(options, [], false).map((option) => option.optionId)).toEqual(['option-1', 'option-2', 'option-3', 'option-4'])
  })

  it('keeps a selected option outside the preview visible', () => {
    expect(getVisibleSalesAgentInteractionOptions(options, ['option-6'], false).map((option) => option.optionId)).toEqual(['option-1', 'option-2', 'option-3', 'option-4', 'option-6'])
  })

  it('shows all options only after expansion', () => {
    expect(getVisibleSalesAgentInteractionOptions(options, [], true)).toHaveLength(8)
  })
})
