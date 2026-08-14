import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { KnownEntityLedger } from './ledgers/known-entities'
import { BindingLedger } from './ledgers/bindings'
import { EvidenceLedger } from './ledgers/evidence'

describe('Orchestrator V2 Ledgers', () => {
  it('KnownEntityLedger registers and queries entities', () => {
    const ledger = new KnownEntityLedger()
    ledger.addEntity('PRODUCT', 'vf8-id', 'VinFast VF 8', 'RESOLVER')
    ledger.addEntity('PRODUCT', 'vf5-id', 'VinFast VF 5 Plus', 'BROWSE')

    expect(ledger.hasEntity('PRODUCT', 'vf8-id')).toBe(true)
    expect(ledger.hasEntity('PRODUCT', 'unknown-id')).toBe(false)

    const all = ledger.getAllEntities()
    expect(all.length).toBe(2)

    const refs = ledger.toKnownRefs()
    expect(refs).toEqual([
      { kind: 'PRODUCT', id: 'vf8-id' },
      { kind: 'PRODUCT', id: 'vf5-id' },
    ])
  })

  it('BindingLedger applies enforced/confirmed bindings without mutating on HINT', () => {
    const ledger = new BindingLedger()

    // Set HINT binding - should NOT mutate input
    ledger.setBinding({
      field: 'productTypes',
      value: ['CAR'],
      authority: 'HINT',
      provenance: { kind: 'PAGE_CONTEXT' },
    })

    const hintRes = ledger.applyBindings({ sort: { field: 'PRICE', direction: 'ASC' } })
    expect(hintRes.effectiveInput.productTypes).toBeUndefined()
    expect(hintRes.appliedBindings.length).toBe(0)

    // Set CONFIRMED binding - SHOULD add missing field
    ledger.setBinding({
      field: 'productTypes',
      value: ['CAR'],
      authority: 'CONFIRMED',
      provenance: { kind: 'SIGNED_INTERACTION', id: 'turn-1' },
    })

    const confirmedRes = ledger.applyBindings({ sort: { field: 'PRICE', direction: 'ASC' } })
    expect(confirmedRes.effectiveInput.productTypes).toEqual(['CAR'])
    expect(confirmedRes.appliedBindings.length).toBe(1)

    // Conflicting value should return conflict
    const conflictRes = ledger.applyBindings({ productTypes: ['BIKE'] })
    expect(conflictRes.conflict).toBeDefined()
    expect(conflictRes.conflict?.field).toBe('productTypes')
  })

  it('EvidenceLedger indexes facts and validates FactPointerV2', () => {
    const ledger = new EvidenceLedger()
    const readAt = new Date().toISOString()

    ledger.recordEvidence([
      {
        evidenceId: 'ev-1',
        source: { system: 'SUPABASE', resource: 'products' },
        entity: { kind: 'PRODUCT', id: 'vf8-id' },
        facts: [
          { factRef: 'fact-price-vf8', factPath: 'pricing.from', valueHash: '1090000000' },
        ],
        readAt,
      },
    ])

    expect(ledger.hasFact('fact-price-vf8')).toBe(true)
    expect(ledger.hasFact('fact-nonexistent')).toBe(false)

    // Valid pointer
    const validPointer = {
      factRef: 'fact-price-vf8',
      evidenceId: 'ev-1',
      entityKind: 'PRODUCT' as const,
      entityId: 'vf8-id',
      factPath: 'pricing.from',
    }
    expect(ledger.validateFactPointer(validPointer).valid).toBe(true)

    // Tampered entityId pointer
    const invalidEntityPointer = {
      ...validPointer,
      entityId: 'vf5-id',
    }
    expect(ledger.validateFactPointer(invalidEntityPointer).valid).toBe(false)

    // Tampered factPath pointer
    const invalidPathPointer = {
      ...validPointer,
      factPath: 'pricing.to',
    }
    expect(ledger.validateFactPointer(invalidPathPointer).valid).toBe(false)
  })
})
