import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '../../../../lib/supabase-admin'

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
    .order('created_at', { ascending: false })

  if (query) {
    const sanitizedQuery = query.replace(/['&|!():*]/g, '').trim()
    if (sanitizedQuery) {
      const words = sanitizedQuery.split(/\s+/)
      const tsQuery = words.map(word => `'${word}':*`).join(' & ')
      dbQuery = dbQuery.textSearch('search_vector', tsQuery)
    }
  }

  const { data, error } = await dbQuery
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  // Flatten category name for easier client usage
  const formattedData = data.map((item: any) => ({
    ...item,
    category: item.categories?.name || 'Chưa phân loại'
  }))
  
  return NextResponse.json(formattedData)
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const supabase = getSupabaseAdmin()
    
    const { data, error } = await supabase
      .from('products')
      .insert([body])
      .select()
      .single()
      
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
