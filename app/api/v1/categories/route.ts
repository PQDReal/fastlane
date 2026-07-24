import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '../../../../lib/supabase-admin'

export async function GET() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}