import type { EntityKind, KnownEntityRefV2 } from '../../../contracts/v2'

export type KnownEntityEntry = {
  id: string
  kind: EntityKind
  name?: string
  source: 'CONTEXT' | 'RESOLVER' | 'BROWSE' | 'DETAILS' | 'INTERACTION'
}

export class KnownEntityLedger {
  private readonly entities = new Map<string, KnownEntityEntry>()

  addEntity(kind: EntityKind, id: string, name?: string, source: KnownEntityEntry['source'] = 'BROWSE') {
    if (!id) return
    const key = `${kind}:${id}`
    this.entities.set(key, { id, kind, name, source })
  }

  hasEntity(kind: EntityKind, id: string): boolean {
    return this.entities.has(`${kind}:${id}`)
  }

  getEntity(kind: EntityKind, id: string): KnownEntityEntry | undefined {
    return this.entities.get(`${kind}:${id}`)
  }

  getAllEntities(): KnownEntityEntry[] {
    return Array.from(this.entities.values())
  }

  toKnownRefs(): KnownEntityRefV2[] {
    const refs: KnownEntityRefV2[] = []
    for (const entry of this.entities.values()) {
      if (entry.kind === 'PRODUCT' || entry.kind === 'ACCESSORY_CATEGORY' || entry.kind === 'PROMOTION') {
        refs.push({ kind: entry.kind, id: entry.id })
      }
    }
    return refs
  }
}
