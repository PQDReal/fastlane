import 'server-only'

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { ProductType } from '../contracts'

export const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes

export interface CachedProductVariant {
  id: string
  name: string
  sku: string
  originalPrice: number | null
  salePrice: number | null
  isActive: boolean
}

export interface CachedVehicleVariant {
  id: string
  productVariantId: string
  version: string | null
  color: string | null
  isActive: boolean
}

export interface CachedProduct {
  id: string
  name: string
  slug: string
  description: string | null
  productType: ProductType
  displayedPrice: number | null
  thumbnailUrl: string | null
  imageUrls: string[]
  specifications: Record<string, string>
  updatedAt: string | null
  variants: CachedProductVariant[]
  vehicleVariants: CachedVehicleVariant[]
}

export interface CachedAccessory {
  productId: string
  name: string
  slug: string
  description: string | null
  price: number | null
  categoryName: string | null
  imageUrls: string[]
  updatedAt: string | null
}

export interface CachedKnowledgeChunk {
  chunkId: string
  documentId: string
  documentSlug: string
  documentTitle: string
  category: string
  sectionTitle: string
  content: string
  tags: string[]
}

export interface CachedCatalogSnapshot {
  products: CachedProduct[]
  accessories: CachedAccessory[]
  /** Legacy compatibility only. The catalog cache no longer loads knowledge chunks. */
  knowledgeChunks?: CachedKnowledgeChunk[]
  lastRefreshedAt: number
  isSeededFallback: boolean
}

function mapDatabaseProductType(type: string): ProductType {
  const upper = (type || '').toUpperCase()
  if (upper === 'CAR' || upper === 'VEHICLE') return 'CAR'
  if (upper === 'BIKE' || upper === 'MOTORBIKE') return 'BIKE'
  if (upper === 'ACCESSORY') return 'ACCESSORY'
  return 'CAR'
}

// Default Seeded Fallback Snapshot in case DB is unreachable
const INITIAL_SEEDED_PRODUCTS: CachedProduct[] = [
  {
    id: 'prod-vf-3',
    name: 'VinFast VF 3',
    slug: 'vinfast-vf-3',
    description: 'Mini-SUV điện thông minh, linh hoạt cho đô thị.',
    productType: 'CAR',
    displayedPrice: 240000000,
    thumbnailUrl: '/images/products/vf3.png',
    imageUrls: ['/images/products/vf3.png'],
    specifications: {
      seats: '4',
      battery_kwh: '18.64',
      range_km: '215',
      power_kw: '30',
      power_hp: '43',
      torque_nm: '110',
      fast_charge_min: '36',
      warranty_vehicle: '7 năm / 160.000 km',
      warranty_battery: '8 năm',
    },
    updatedAt: new Date().toISOString(),
    variants: [{ id: 'var-vf3-base', name: 'VF 3 Base', sku: 'VF3-BASE', originalPrice: 240000000, salePrice: 240000000, isActive: true }],
    vehicleVariants: [{ id: 'vv-vf3', productVariantId: 'var-vf3-base', version: 'Tiêu chuẩn', color: 'Vàng', isActive: true }],
  },
  {
    id: 'prod-vf-5',
    name: 'VinFast VF 5 Plus',
    slug: 'vinfast-vf-5-plus',
    description: 'SUV đô thị cỡ A năng động, tối ưu chi phí vận hành.',
    productType: 'CAR',
    displayedPrice: 468000000,
    thumbnailUrl: '/images/products/vf5.png',
    imageUrls: ['/images/products/vf5.png'],
    specifications: {
      seats: '5',
      battery_kwh: '37.23',
      range_km: '326',
      power_kw: '100',
      power_hp: '134',
      torque_nm: '135',
      fast_charge_min: '30',
      warranty_vehicle: '10 năm / 200.000 km',
      warranty_battery: '10 năm không giới hạn km',
    },
    updatedAt: new Date().toISOString(),
    variants: [{ id: 'var-vf5-plus', name: 'VF 5 Plus', sku: 'VF5-PLUS', originalPrice: 468000000, salePrice: 468000000, isActive: true }],
    vehicleVariants: [{ id: 'vv-vf5', productVariantId: 'var-vf5-plus', version: 'Plus', color: 'Trắng', isActive: true }],
  },
  {
    id: 'prod-vf-6',
    name: 'VinFast VF 6',
    slug: 'vinfast-vf-6',
    description: 'Crossover hạng B thời thượng, tiện nghi cho gia đình trẻ.',
    productType: 'CAR',
    displayedPrice: 675000000,
    thumbnailUrl: '/images/products/vf6.png',
    imageUrls: ['/images/products/vf6.png'],
    specifications: {
      seats: '5',
      battery_kwh: '59.6',
      range_km: '399',
      power_kw: '150',
      power_hp: '201',
      torque_nm: '310',
      fast_charge_min: '24',
      warranty_vehicle: '10 năm / 200.000 km',
      warranty_battery: '10 năm không giới hạn km',
    },
    updatedAt: new Date().toISOString(),
    variants: [{ id: 'var-vf6-plus', name: 'VF 6 Plus', sku: 'VF6-PLUS', originalPrice: 765000000, salePrice: 765000000, isActive: true }],
    vehicleVariants: [{ id: 'vv-vf6', productVariantId: 'var-vf6-plus', version: 'Plus', color: 'Xanh', isActive: true }],
  },
  {
    id: 'prod-vf-7',
    name: 'VinFast VF 7',
    slug: 'vinfast-vf-7',
    description: 'SUV điện cỡ C phong cách vũ trụ phi đối xứng, vận hành vượt trội.',
    productType: 'CAR',
    displayedPrice: 850000000,
    thumbnailUrl: '/images/products/vf7.png',
    imageUrls: ['/images/products/vf7.png'],
    specifications: {
      seats: '5',
      battery_kwh: '75.3',
      range_km: '431',
      power_kw: '260',
      power_hp: '349',
      torque_nm: '500',
      fast_charge_min: '24',
      warranty_vehicle: '10 năm / 200.000 km',
      warranty_battery: '10 năm không giới hạn km',
    },
    updatedAt: new Date().toISOString(),
    variants: [{ id: 'var-vf7-plus', name: 'VF 7 Plus', sku: 'VF7-PLUS', originalPrice: 999000000, salePrice: 999000000, isActive: true }],
    vehicleVariants: [{ id: 'vv-vf7', productVariantId: 'var-vf7-plus', version: 'Plus', color: 'Xám', isActive: true }],
  },
  {
    id: 'prod-vf-8',
    name: 'VinFast VF 8',
    slug: 'vinfast-vf-8',
    description: 'SUV điện phân khúc D đẳng cấp quốc tế, trang bị ADAS cao cấp.',
    productType: 'CAR',
    displayedPrice: 1090000000,
    thumbnailUrl: '/images/products/vf8.png',
    imageUrls: ['/images/products/vf8.png'],
    specifications: {
      seats: '5',
      battery_kwh: '87.7',
      range_km: '471',
      power_kw: '300',
      power_hp: '402',
      torque_nm: '620',
      fast_charge_min: '24',
      warranty_vehicle: '10 năm / 200.000 km',
      warranty_battery: '10 năm không giới hạn km',
    },
    updatedAt: new Date().toISOString(),
    variants: [{ id: 'var-vf8-eco', name: 'VF 8 Eco', sku: 'VF8-ECO', originalPrice: 1090000000, salePrice: 1090000000, isActive: true }],
    vehicleVariants: [{ id: 'vv-vf8', productVariantId: 'var-vf8-eco', version: 'Eco', color: 'Đen', isActive: true }],
  },
  {
    id: 'prod-vf-9',
    name: 'VinFast VF 9',
    slug: 'vinfast-vf-9',
    description: 'SUV điện full-size phân khúc E hạng sang, 7 chỗ hoặc 6 chỗ cơ trưởng.',
    productType: 'CAR',
    displayedPrice: 1984000000,
    thumbnailUrl: '/images/products/vf9.png',
    imageUrls: ['/images/products/vf9.png'],
    specifications: {
      seats: '7',
      battery_kwh: '123',
      range_km: '626',
      power_kw: '300',
      power_hp: '402',
      torque_nm: '620',
      fast_charge_min: '26',
      warranty_vehicle: '10 năm / 200.000 km',
      warranty_battery: '10 năm không giới hạn km',
    },
    updatedAt: new Date().toISOString(),
    variants: [{ id: 'var-vf9-plus', name: 'VF 9 Plus', sku: 'VF9-PLUS', originalPrice: 2169000000, salePrice: 2169000000, isActive: true }],
    vehicleVariants: [{ id: 'vv-vf9', productVariantId: 'var-vf9-plus', version: 'Plus', color: 'Xanh cửu long', isActive: true }],
  },
  {
    id: 'prod-evo-200',
    name: 'VinFast Evo 200',
    slug: 'vinfast-evo-200',
    description: 'Xe máy điện quốc dân đi xa tới 205 km/lần sạc.',
    productType: 'BIKE',
    displayedPrice: 18000000,
    thumbnailUrl: '/images/products/evo200.png',
    imageUrls: ['/images/products/evo200.png'],
    specifications: {
      battery: 'LFP 3.5 kWh',
      range_km: '205',
      top_speed_kmh: '70',
      power_w: '2500',
      trunk_liters: '22',
      warranty: '5 năm không giới hạn km',
    },
    updatedAt: new Date().toISOString(),
    variants: [{ id: 'var-evo', name: 'Evo 200', sku: 'EVO-200', originalPrice: 18000000, salePrice: 18000000, isActive: true }],
    vehicleVariants: [],
  },
  {
    id: 'prod-feliz-s',
    name: 'VinFast Feliz S',
    slug: 'vinfast-feliz-s',
    description: 'Xe máy điện thanh lịch, động cơ 3000W mạnh mẽ, cốp rộng 25L.',
    productType: 'BIKE',
    displayedPrice: 27000000,
    thumbnailUrl: '/images/products/feliz-s.png',
    imageUrls: ['/images/products/feliz-s.png'],
    specifications: {
      battery: 'LFP 3.5 kWh',
      range_km: '198',
      top_speed_kmh: '78',
      power_w: '3000',
      trunk_liters: '25',
      warranty: '5 năm không giới hạn km',
    },
    updatedAt: new Date().toISOString(),
    variants: [{ id: 'var-feliz', name: 'Feliz S', sku: 'FELIZ-S', originalPrice: 27000000, salePrice: 27000000, isActive: true }],
    vehicleVariants: [],
  },
  {
    id: 'prod-klara-s',
    name: 'VinFast Klara S',
    slug: 'vinfast-klara-s',
    description: 'Xe máy điện thanh lịch, cốp rộng, pin LFP bền bỉ.',
    productType: 'BIKE',
    displayedPrice: 35000000,
    thumbnailUrl: '/images/products/klara-s.png',
    imageUrls: ['/images/products/klara-s.png'],
    specifications: {
      battery: 'LFP 3.5 kWh',
      range_km: '194',
      top_speed_kmh: '78',
      power_w: '3000',
      trunk_liters: '23',
      warranty: '5 năm không giới hạn km',
    },
    updatedAt: new Date().toISOString(),
    variants: [{ id: 'var-klara', name: 'Klara S', sku: 'KLARA-S', originalPrice: 35000000, salePrice: 35000000, isActive: true }],
    vehicleVariants: [],
  },
]

const INITIAL_SEEDED_ACCESSORIES: CachedAccessory[] = [
  { productId: 'acc-1', name: 'Thảm lót cốp 3D VF 3', slug: 'tham-lot-cop-3d-vf-3', description: 'Chống thấm, dễ vệ sinh cho VF 3', price: 250000, categoryName: 'Nội thất', imageUrls: [], updatedAt: new Date().toISOString() },
  { productId: 'acc-2', name: 'Bao da giấy tờ xe cao cấp', slug: 'bao-da-giay-to-xe', description: '3 ngăn bảo quản đăng ký, bằng lái', price: 294000, categoryName: 'Phụ kiện', imageUrls: [], updatedAt: new Date().toISOString() },
  { productId: 'acc-3', name: 'Gối cổ chữ U êm ái', slug: 'goi-co-chu-u', description: 'Hỗ trợ đi đường dài êm ái', price: 116000, categoryName: 'Nội thất', imageUrls: [], updatedAt: new Date().toISOString() },
  { productId: 'acc-4', name: 'Áo mưa cánh dơi một mũ', slug: 'ao-mua-mot-mu', description: 'Áo mưa chống thấm có lỗ xỏ gương xe máy', price: 150000, categoryName: 'Xe máy', imageUrls: [], updatedAt: new Date().toISOString() },
]

export class CatalogCacheEngine {
  private static instance: CatalogCacheEngine
  private snapshot: CachedCatalogSnapshot
  private isRefreshing: boolean = false
  private refreshPromise: Promise<CachedCatalogSnapshot> | null = null

  private constructor() {
    this.snapshot = {
      products: INITIAL_SEEDED_PRODUCTS,
      accessories: INITIAL_SEEDED_ACCESSORIES,
      lastRefreshedAt: 0, // 0 forces initial background refresh
      isSeededFallback: true,
    }
  }

  public static getInstance(): CatalogCacheEngine {
    if (!CatalogCacheEngine.instance) {
      CatalogCacheEngine.instance = new CatalogCacheEngine()
    }
    return CatalogCacheEngine.instance
  }

  public getSnapshot(): CachedCatalogSnapshot {
    const now = Date.now()
    // Stale-While-Revalidate: Trigger background refresh if older than 30 minutes
    if (now - this.snapshot.lastRefreshedAt > CACHE_TTL_MS && !this.isRefreshing) {
      void this.revalidateAsync(false)
    }
    return this.snapshot
  }

  public async getSnapshotAsync(): Promise<CachedCatalogSnapshot> {
    if (this.snapshot.lastRefreshedAt === 0) {
      await this.revalidateAsync(true)
    } else if (Date.now() - this.snapshot.lastRefreshedAt > CACHE_TTL_MS && !this.isRefreshing) {
      void this.revalidateAsync(false)
    }
    return this.snapshot
  }

  public async forceRefresh(): Promise<CachedCatalogSnapshot> {
    return this.revalidateAsync(true)
  }

  public getStatus() {
    const now = Date.now()
    const ageMs = this.snapshot.lastRefreshedAt === 0 ? 0 : now - this.snapshot.lastRefreshedAt
    return {
      lastRefreshedAt: this.snapshot.lastRefreshedAt,
      ageSeconds: Math.floor(ageMs / 1000),
      isExpired: ageMs > CACHE_TTL_MS,
      isRefreshing: this.isRefreshing,
      isSeededFallback: this.snapshot.isSeededFallback,
      productsCount: this.snapshot.products.length,
      carsCount: this.snapshot.products.filter((p) => p.productType === 'CAR').length,
      bikesCount: this.snapshot.products.filter((p) => p.productType === 'BIKE').length,
      accessoriesCount: this.snapshot.accessories.length,
    }
  }

  public async revalidateAsync(force: boolean = false): Promise<CachedCatalogSnapshot> {
    if (this.isRefreshing && this.refreshPromise && !force) {
      return this.refreshPromise
    }

    this.isRefreshing = true
    this.refreshPromise = this.fetchFromDatabase()
      .then((newSnapshot) => {
        // Atomic swapping: swap active snapshot only when fetch succeeded
        this.snapshot = newSnapshot
        this.isRefreshing = false
        this.refreshPromise = null
        return newSnapshot
      })
      .catch((err) => {
        console.warn('[CATALOG CACHE ENGINE] Background revalidation failed gracefully, keeping existing snapshot:', err?.message || err)
        this.isRefreshing = false
        this.refreshPromise = null
        this.snapshot.lastRefreshedAt = Date.now() - (CACHE_TTL_MS - 60000) // retry in 1 minute
        return this.snapshot
      })

    return this.refreshPromise
  }

  private async fetchFromDatabase(): Promise<CachedCatalogSnapshot> {
    const supabase = getSupabaseAdmin()

    // 1. Fetch active products with variants
    const productsPromise = supabase
      .from('products')
      .select(`
        id,
        name,
        slug,
        description,
        product_type,
        displayed_price,
        image_urls,
        thumbnail_url,
        specifications,
        is_active,
        updated_at,
        product_variants (
          id,
          name,
          sku,
          original_price,
          sale_price,
          is_active
        ),
        vehicle_variants (
          id,
          product_variant_id,
          version,
          color,
          is_active
        )
      `)
      .eq('is_active', true)
      .order('displayed_price', { ascending: true })

    // Timeout guard (3.5s) to avoid hanging server
    const timeoutPromise = new Promise<{ data: null; error: Error }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: new Error('Supabase cache fetch timeout') }), 3500),
    )

    const productsResult = await Promise.race([productsPromise, timeoutPromise])

    const fetchedProducts: CachedProduct[] = []
    const fetchedAccessories: CachedAccessory[] = []

    if (productsResult.data && Array.isArray(productsResult.data) && productsResult.data.length > 0) {
      for (const row of productsResult.data as any[]) {
        const pType = mapDatabaseProductType(row.product_type)
        const variants: CachedProductVariant[] = (row.product_variants || []).map((v: any) => ({
          id: String(v.id),
          name: v.name,
          sku: v.sku,
          originalPrice: v.original_price,
          salePrice: v.sale_price,
          isActive: Boolean(v.is_active),
        }))

        const vehicleVariants: CachedVehicleVariant[] = (row.vehicle_variants || []).map((vv: any) => ({
          id: String(vv.id),
          productVariantId: String(vv.product_variant_id),
          version: vv.version,
          color: vv.color,
          isActive: Boolean(vv.is_active),
        }))

        if (pType === 'ACCESSORY') {
          fetchedAccessories.push({
            productId: String(row.id),
            name: row.name,
            slug: row.slug,
            description: row.description,
            price: row.displayed_price,
            categoryName: 'Phụ kiện',
            imageUrls: Array.isArray(row.image_urls) ? row.image_urls : [],
            updatedAt: row.updated_at,
          })
        } else {
          fetchedProducts.push({
            id: String(row.id),
            name: row.name,
            slug: row.slug,
            description: row.description,
            productType: pType,
            displayedPrice: row.displayed_price,
            thumbnailUrl: row.thumbnail_url || (Array.isArray(row.image_urls) ? row.image_urls[0] : null),
            imageUrls: Array.isArray(row.image_urls) ? row.image_urls : [],
            specifications: (row.specifications || {}) as Record<string, string>,
            updatedAt: row.updated_at,
            variants,
            vehicleVariants,
          })
        }
      }
    }

    const finalProducts = fetchedProducts.length > 0 ? fetchedProducts : INITIAL_SEEDED_PRODUCTS
    const finalAccessories = fetchedAccessories.length > 0 ? fetchedAccessories : INITIAL_SEEDED_ACCESSORIES

    return {
      products: finalProducts,
      accessories: finalAccessories,
      lastRefreshedAt: Date.now(),
      isSeededFallback: fetchedProducts.length === 0,
    }
  }
}

export const catalogCacheEngine = CatalogCacheEngine.getInstance()
