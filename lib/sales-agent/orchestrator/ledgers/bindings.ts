import type { AppliedBinding } from '../../contracts'

export type BindingAuthority = 'ENFORCED' | 'CONFIRMED' | 'HINT'

export type BindingRecord = {
  field: string
  value: unknown
  authority: BindingAuthority
  provenance: {
    kind: 'SIGNED_INTERACTION' | 'BUSINESS_INVARIANT' | 'PAGE_CONTEXT'
    id?: string
  }
}

export class BindingLedger {
  private bindings = new Map<string, BindingRecord>()

  setBinding(record: BindingRecord) {
    this.bindings.set(record.field, record)
  }

  getBinding(field: string): BindingRecord | undefined {
    return this.bindings.get(field)
  }

  applyBindings(toolInput: Record<string, any>): {
    effectiveInput: Record<string, any>
    appliedBindings: AppliedBinding[]
    conflict?: { field: string; requestedValue: unknown; enforcedValue: unknown }
  } {
    const effective = { ...toolInput }
    const applied: AppliedBinding[] = []

    for (const [field, binding] of this.bindings.entries()) {
      if (binding.authority === 'HINT') continue

      const currentVal = effective[field]
      if (currentVal !== undefined && JSON.stringify(currentVal) !== JSON.stringify(binding.value)) {
        if (binding.authority === 'ENFORCED' || binding.authority === 'CONFIRMED') {
          return {
            effectiveInput: toolInput,
            appliedBindings: [],
            conflict: {
              field,
              requestedValue: currentVal,
              enforcedValue: binding.value,
            },
          }
        }
      }

      if (currentVal === undefined) {
        effective[field] = binding.value
        applied.push({
          field,
          value: binding.value,
          authority: binding.authority as 'ENFORCED' | 'CONFIRMED',
          provenance: binding.provenance,
        })
      }
    }

    return {
      effectiveInput: effective,
      appliedBindings: applied,
    }
  }

  getAllBindings(): BindingRecord[] {
    return Array.from(this.bindings.values())
  }
}
