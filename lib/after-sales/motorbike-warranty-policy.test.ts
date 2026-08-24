import { describe, expect, it } from 'vitest'

import {
  findOfficialMotorbikeOwnerManual,
  MOTORBIKE_OWNER_MANUALS,
  MOTORBIKE_WARRANTY_BOOKS,
  VERIFIED_MOTORBIKE_WARRANTY_KNOWLEDGE_MARKDOWN,
  VERIFIED_MOTORBIKE_WARRANTY_POLICIES,
} from './motorbike-warranty-policy'

describe('verified motorbike warranty policy registry', () => {
  it('preserves the invoice-date split for original LFP batteries', () => {
    expect(VERIFIED_MOTORBIKE_WARRANTY_POLICIES).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'lfp-invoice-before-2025-08-15',
        vehicleWarranty: '5 năm, không giới hạn quãng đường',
        batteryWarranty: '5 năm, không giới hạn quãng đường',
      }),
      expect.objectContaining({
        id: 'lfp-invoice-from-2025-08-15',
        vehicleWarranty: '6 năm, không giới hạn quãng đường',
        batteryWarranty: '8 năm, không giới hạn quãng đường',
      }),
    ]))
  })

  it('retains every currently linked official PDF without ingesting its content', () => {
    expect(MOTORBIKE_WARRANTY_BOOKS).toHaveLength(3)
    expect(MOTORBIKE_OWNER_MANUALS).toHaveLength(40)

    const documents = [...MOTORBIKE_WARRANTY_BOOKS, ...MOTORBIKE_OWNER_MANUALS]
    expect(new Set(documents.map((document) => document.id)).size).toBe(documents.length)
    expect(new Set(documents.map((document) => document.url)).size).toBe(documents.length)
    for (const document of documents) {
      const url = new URL(document.url)
      expect(url.protocol).toBe('https:')
      expect(url.hostname).toBe('static-cms-prod.vinfastauto.com')
      expect(url.pathname.toLowerCase()).toMatch(/\.pdf$/)
    }
  })

  it('instructs model-specific answers to retain policy context and the real after-sales route', () => {
    expect(VERIFIED_MOTORBIKE_WARRANTY_KNOWLEDGE_MARKDOWN.toLowerCase()).toContain('chỉ tên mẫu xe như evo là chưa đủ')
    expect(VERIFIED_MOTORBIKE_WARRANTY_KNOWLEDGE_MARKDOWN).toContain('/after-sales?vehicle=motorbike&tab=warranty#warranty-term')
    expect(VERIFIED_MOTORBIKE_WARRANTY_KNOWLEDGE_MARKDOWN).not.toContain('/knowledge/')
  })

  it('resolves the longest exact official manual name without confusing nearby models', () => {
    expect(findOfficialMotorbikeOwnerManual('Hướng dẫn sử dụng xe Klara S')?.id).toBe('klara-s')
    expect(findOfficialMotorbikeOwnerManual('Cho tôi HDSD Klara S2')?.id).toBe('klara-s2')
    expect(findOfficialMotorbikeOwnerManual('HDSD Evo 200 Lite')?.id).toBe('evo200-lite')
    expect(findOfficialMotorbikeOwnerManual('HDSD VF 8')).toBeNull()
  })
})
