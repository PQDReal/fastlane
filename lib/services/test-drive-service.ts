import 'server-only'

import { getSupabaseAdmin } from '@/lib/supabase-admin'

export type TestDriveVehicleOption = {
  id: string
  name: string
  category: string
}

type ProductRow = {
  id: string
  name: string
  categories: { name: string } | { name: string }[] | null
}

const VEHICLE_CATEGORIES = new Set(['Ô tô điện', 'Xe máy điện'])

export async function listTestDriveVehicles(): Promise<TestDriveVehicleOption[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('products')
    .select('id, name, categories(name)')
    .eq('is_active', true)
    .order('name')

  if (error) {
    throw new Error(`Không thể tải danh sách mẫu xe: ${error.message}`)
  }

  return ((data ?? []) as ProductRow[])
    .filter((product) => {
      const category = Array.isArray(product.categories)
        ? product.categories[0]
        : product.categories

      return category ? VEHICLE_CATEGORIES.has(category.name) : false
    })
    .map((product) => {
      const category = Array.isArray(product.categories)
        ? product.categories[0]
        : product.categories

      return {
        id: product.id,
        name: product.name,
        category: category!.name,
      }
    })
}