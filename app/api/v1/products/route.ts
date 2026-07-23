import { NextResponse } from 'next/server'

import { getSupabaseAdmin } from '@/lib/supabase-admin'

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

  if (query) {
    const sanitizedQuery = query.replace(/['&|!():*]/g, '').trim()

    if (sanitizedQuery) {
      const words = sanitizedQuery.split(/\s+/)
      const tsQuery = words.map((word) => `'${word}':*`).join(' & ')
      dbQuery = dbQuery.textSearch('search_vector', tsQuery)
    }
  }

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