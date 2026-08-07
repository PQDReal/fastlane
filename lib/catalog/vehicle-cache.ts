import 'server-only'

import { revalidateTag } from 'next/cache'

import {
  CAR_CATALOG_CACHE_PREFIX,
  CAR_DETAIL_CACHE_PREFIX,
  MOTORBIKE_CATALOG_CACHE_KEY,
  MOTORBIKE_DETAIL_CACHE_PREFIX,
} from '@/lib/cache-keys'
import { deleteRedisKey, deleteRedisKeysByPrefix } from '@/lib/redis'

export async function invalidateVehicleCatalogCaches() {
  revalidateTag('vehicle-catalog')
  revalidateTag('car-catalog')
  revalidateTag('motorbike-catalog')

  await Promise.all([
    deleteRedisKeysByPrefix(CAR_CATALOG_CACHE_PREFIX),
    deleteRedisKeysByPrefix(CAR_DETAIL_CACHE_PREFIX),
    deleteRedisKey(MOTORBIKE_CATALOG_CACHE_KEY),
    deleteRedisKeysByPrefix(MOTORBIKE_DETAIL_CACHE_PREFIX),
  ])
}
