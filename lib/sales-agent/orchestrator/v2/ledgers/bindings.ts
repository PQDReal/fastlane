import type { AppliedBinding } from '../../../contracts/v2'

export type BindingAuthority = 'ENFORCED' | 'CONFIRMED' | 'HINT'

export type BindingEntry<T = any> = {
  field: string
  value: T
  authority: BindingAuthority
  provenance: {
    kind: string
    id?: string
  }
  expiresAt?: string
}

export type BindingApplicationResult = {
  effectiveInput: Record<string, any>
  appliedBindings: AppliedBinding[]
  conflict?: {
    field: string
    requestedValue: any
    boundValue: any
    authority: BindingAuthority
  }
}

export class BindingLedger {
  private readonly bindings = new Map<string, BindingEntry>()

  setBinding<T>(entry: BindingEntry<T>) {
    this.bindings.set(entry.field, entry)
  }

  getBinding(field: string): BindingEntry | undefined {
    return this.bindings.get(field)
  }

  applyBindings(input: Record<string, any> | undefined = {}): BindingApplicationResult {
    const effectiveInput = { ...input }
    const appliedBindings: AppliedBinding[] = []

    for (const binding of this.bindings.values()) {
      // Ignore expired bindings
      if (binding.expiresAt && new Date(binding.expiresAt).getTime() <= Date.now()) {
        continue
      }

      // HINT never mutates effective input
      if (binding.authority === 'HINT') {
        continue
      }

      const currentVal = effectiveInput[binding.field]

      if (currentVal === undefined) {
        effectiveInput[binding.field] = binding.value
        appliedBindings.push({
          field: binding.field,
          value: binding.value,
          authority: binding.authority,
          provenance: binding.provenance,
        })
      } else if (JSON.stringify(currentVal) !== JSON.stringify(binding.value)) {
        return {
          effectiveInput,
          appliedBindings,
          conflict: {
            field: binding.field,
            requestedValue: currentVal,
            boundValue: binding.value,
            authority: binding.authority,
          },
        }
      }
    }

    return {
      effectiveInput,
      appliedBindings,
    }
  }
}
