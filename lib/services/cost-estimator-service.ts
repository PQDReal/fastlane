import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { listMotorbikeCatalog } from '@/lib/motorbike-catalog'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type {
  FeeType,
  VehicleType,
} from '@/lib/services/admin-cost-policy-service'

export type EstimateVehicle = {
  id: string
  name: string
  slug: string
  category: 'CAR' | 'MOTORBIKE'
  price: number
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

async function loadCostEstimatorData() {
  const supabase = getSupabaseAdmin()
  const now = new Date().toISOString()
  const [carResult, motorbikes, feeResult] = await Promise.all([
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
  ])

  if (carResult.error || feeResult.error) {
    throw new Error('Không thể tải dữ liệu dự toán chi phí.')
  }

  const cars = ((carResult.data ?? []) as ProductRow[]).flatMap((item) => {
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
    }]
  })

  const bikes = motorbikes.map((motorbike) => ({
    id: motorbike.productId,
    name: motorbike.name,
    slug: motorbike.slug,
    category: 'MOTORBIKE' as const,
    price: motorbike.displayedPrice,
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
