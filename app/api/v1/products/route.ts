import { NextResponse } from 'next/server'

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { toNamePrefixTsQuery } from '@/lib/catalog/search'
import { listMotorbikeCatalog } from '@/lib/motorbike-catalog'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')
  const supabase = getSupabaseAdmin()

  let dbQuery = supabase
    .from('products')
    .select(`
      *,
      categories (
        name
      )
    `)
    .eq('is_active', true)
    .not('product_type', 'in', '(BIKE,MOTORBIKE)')
    .order('created_at', { ascending: false })

  const tsQuery = toNamePrefixTsQuery(query)
  if (tsQuery) dbQuery = dbQuery.textSearch('search_vector', tsQuery, { config: 'simple' })

  const [{ data, error }, motorbikes] = await Promise.all([
    dbQuery,
    listMotorbikeCatalog(),
  ])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const productResults = data.map((item) => ({
      ...item,
      category: item.categories?.name || 'Chưa phân loại',
    }))
  const normalizedQuery = query?.trim().toLocaleLowerCase('vi') ?? ''
  const motorbikeResults = motorbikes
    .filter((motorbike) =>
      !normalizedQuery ||
      motorbike.name.toLocaleLowerCase('vi').includes(normalizedQuery),
    )
    .map((motorbike) => ({
      id: motorbike.productId,
      name: motorbike.name,
      slug: motorbike.slug,
      product_type: 'BIKE',
      displayed_price: motorbike.displayedPrice,
      specifications: motorbike.specifications,
      image_urls: [motorbike.listingImageUrl],
      category: 'Xe máy điện',
    }))

  return NextResponse.json([...productResults, ...motorbikeResults])
}
