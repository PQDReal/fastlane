import { NextResponse } from 'next/server'

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { toNamePrefixTsQuery } from '@/lib/catalog/search'

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
    .order('created_at', { ascending: false })

  const tsQuery = toNamePrefixTsQuery(query)
  if (tsQuery) dbQuery = dbQuery.textSearch('search_vector', tsQuery, { config: 'simple' })

  const { data, error } = await dbQuery

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(
    data.map((item) => ({
      ...item,
      category: item.categories?.name || 'Chưa phân loại',
    })),
  )
}
