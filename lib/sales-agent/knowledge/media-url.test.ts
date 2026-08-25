import { describe, expect, it } from 'vitest'

import { isAllowedKnowledgeMediaUrl } from './media-url'

describe('knowledge media URL allowlist', () => {
  it('allows verified VinFast media and rejects arbitrary external hosts', () => {
    expect(isAllowedKnowledgeMediaUrl('https://om.vinfastauto.com/assets/diagram.png')).toBe(true)
    expect(isAllowedKnowledgeMediaUrl('https://attacker.example/diagram.png')).toBe(false)
    expect(isAllowedKnowledgeMediaUrl('javascript:void(0)')).toBe(false)
  })
})
