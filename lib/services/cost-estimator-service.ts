import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { listMotorbikeCatalog } from '@/lib/motorbike-catalog'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type {
  FeeType,
  VehicleType,
} from '@/lib/services/admin-cost-policy-service'

export type EstimateVariant = {
  name: string
  price: number
}

export type EstimateVehicle = {
  id: string
  name: string
  slug: string
  category: 'CAR' | 'MOTORBIKE'
  price: number
  variants: EstimateVariant[]
}

export type EstimatePolicy = {
  feeType: FeeType
  name: string
  vehicleType: VehicleType
  calculationType: 'PERCENT' | 'FIXED'
  value: number
  provinceCode: string | null
}

type ProductRow = {
  id: string
  name: string
  slug: string
  displayed_price: number | null
  categories: { name: string } | { name: string }[] | null
}

type VariantRow = {
  product_id: string
  version: string
  price: number
}

async function loadCostEstimatorData() {
  const supabase = getSupabaseAdmin()
  const now = new Date().toISOString()
  const [carResult, motorbikes, feeResult, variantsResult] = await Promise.all([
    supabase
      .from('products')
      .select('id,name,slug,displayed_price,categories(name)')
      .in('product_type', ['CAR', 'VEHICLE'])
      .eq('is_active', true)
      .not('displayed_price', 'is', null)
      .order('name'),
    listMotorbikeCatalog(),
    supabase
      .from('on_road_fee_policies')
      .select('fee_type,name,vehicle_type,calculation_type,value,province_code')
      .eq('is_active', true)
      .lte('effective_from', now)
      .or(`effective_to.is.null,effective_to.gt.${now}`),
    supabase
      .from('vehicle_variants')
      .select('product_id,version,price')
      .eq('is_active', true),
  ])

  if (carResult.error || feeResult.error || variantsResult.error) {
    throw new Error('Không thể tải dữ liệu dự toán chi phí.')
  }

  const variantMap = new Map<string, Map<string, number>>()
  const variants = variantsResult.data as VariantRow[]
  for (const row of variants) {
    if (!row.version) continue
    const productVariants = variantMap.get(row.product_id) || new Map<string, number>()
    const currentPrice = productVariants.get(row.version)
    if (currentPrice === undefined || row.price < currentPrice) {
      productVariants.set(row.version, row.price)
    }
    variantMap.set(row.product_id, productVariants)
  }

  const getVariants = (productId: string, basePrice: number): EstimateVariant[] => {
    const productVariants = variantMap.get(productId)
    if (!productVariants || productVariants.size === 0) {
      return []
    }
    return Array.from(productVariants.entries())
      .map(([name, price]) => ({ name, price }))
      .sort((a, b) => a.price - b.price)
  }

  const cars: EstimateVehicle[] = ((carResult.data ?? []) as ProductRow[]).flatMap((item) => {
    const category = Array.isArray(item.categories)
      ? item.categories[0]?.name
      : item.categories?.name
    if (category !== 'Ô tô điện' || item.displayed_price === null) return []
    return [{
      id: item.id,
      name: item.name,
      slug: item.slug,
      category: 'CAR' as const,
      price: item.displayed_price,
      variants: getVariants(item.id, item.displayed_price),
    }]
  })

  const bikes: EstimateVehicle[] = motorbikes.map((motorbike) => ({
    id: motorbike.productId,
    name: motorbike.name,
    slug: motorbike.slug,
    category: 'MOTORBIKE' as const,
    price: motorbike.displayedPrice,
    variants: getVariants(motorbike.productId, motorbike.displayedPrice),
  }))

  return {
    vehicles: [...cars, ...bikes],
    policies: (feeResult.data ?? []).map((item) => ({
      feeType: item.fee_type as FeeType,
      name: item.name,
      vehicleType: item.vehicle_type as VehicleType,
      calculationType: item.calculation_type as 'PERCENT' | 'FIXED',
      value: Number(item.value),
      provinceCode: item.province_code,
    })),
  }
}

const loadCachedCostEstimatorData = unstable_cache(
  loadCostEstimatorData,
  ['cost-estimator-data-v1'],
  { revalidate: 300, tags: ['vehicle-catalog', 'cost-policies'] },
)

export const getCostEstimatorData = cache(loadCachedCostEstimatorData)
