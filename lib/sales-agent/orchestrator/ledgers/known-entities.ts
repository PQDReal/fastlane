import type { ProductType } from '../../contracts'

export type KnownEntityRecord = {
  kind: 'PRODUCT' | 'ACCESSORY_CATEGORY'
  id: string
  name: string
  productType?: ProductType
  origin: 'BROWSE' | 'RESOLVER' | 'DETAILS' | 'ACTION'
  firstSeenAt: string
}

export class KnownEntityLedger {
  private entities = new Map<string, KnownEntityRecord>()

  addEntity(
    kind: 'PRODUCT' | 'ACCESSORY_CATEGORY',
    id: string,
    name: string,
    origin: 'BROWSE' | 'RESOLVER' | 'DETAILS' | 'ACTION' = 'BROWSE',
    productType?: ProductType,
  ) {
    const key = `${kind}:${id}`
    if (!this.entities.has(key)) {
      this.entities.set(key, {
        kind,
        id,
        name,
        productType,
        origin,
        firstSeenAt: new Date().toISOString(),
      })
    }
  }

  hasEntity(kind: 'PRODUCT' | 'ACCESSORY_CATEGORY', id: string): boolean {
    return this.entities.has(`${kind}:${id}`)
  }

  getEntity(kind: 'PRODUCT' | 'ACCESSORY_CATEGORY', id: string): KnownEntityRecord | undefined {
    return this.entities.get(`${kind}:${id}`)
  }

  getAllEntities(): KnownEntityRecord[] {
    return Array.from(this.entities.values())
  }

  toKnownRefs(): Array<{ kind: 'PRODUCT' | 'ACCESSORY_CATEGORY'; id: string }> {
    return Array.from(this.entities.values()).map((e) => ({
      kind: e.kind,
      id: e.id,
    }))
  }
}
