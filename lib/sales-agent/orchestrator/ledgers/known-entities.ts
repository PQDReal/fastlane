import type { ProductType } from '../../contracts'

export type KnownEntityRecord = {
  kind: 'PRODUCT' | 'ACCESSORY_CATEGORY'
  id: string
  name: string
  slug?: string
  productType?: ProductType
  thumbnailUrl?: string | null
  price?: number | null
  summary?: string | null
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
    metadata?: {
      slug?: string
      thumbnailUrl?: string | null
      price?: number | null
      summary?: string | null
    },
  ) {
    const key = `${kind}:${id}`
    const existing = this.entities.get(key)
    if (!existing) {
      this.entities.set(key, {
        kind,
        id,
        name,
        slug: metadata?.slug,
        productType,
        thumbnailUrl: metadata?.thumbnailUrl,
        price: metadata?.price,
        summary: metadata?.summary,
        origin,
        firstSeenAt: new Date().toISOString(),
      })
    } else {
      // Update missing metadata if available
      if (!existing.thumbnailUrl && metadata?.thumbnailUrl) existing.thumbnailUrl = metadata.thumbnailUrl
      if (!existing.slug && metadata?.slug) existing.slug = metadata.slug
      if (existing.price == null && metadata?.price != null) existing.price = metadata.price
      if (!existing.summary && metadata?.summary) existing.summary = metadata.summary
      if (!existing.productType && productType) existing.productType = productType
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
