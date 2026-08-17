import { NextResponse } from 'next/server'

import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { createServerTiming } from '@/lib/api/server-timing'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

function authorizationError(error: unknown) {
  if (error instanceof ApiAuthError) return authErrorResponse(error)
  throw error
}

function categoryResponse(category: any) {
  return {
    ...category,
    isActive: category.is_active,
  }
}

export async function GET(request: Request) {
  const timing = createServerTiming('route')
  const authorizationStartedAt = performance.now()
  try {
    await authorizeAdminCatalogRequest(request, timing)
  } catch (error) {
    timing.measure('authorization', authorizationStartedAt)
    return timing.attach(authorizationError(error))
  }
  timing.measure('authorization', authorizationStartedAt)

  const databaseStartedAt = performance.now()
  const { data, error } = await getSupabaseAdmin()
    .from('categories')
    .select('id,name,slug,description,is_active,created_at,updated_at')
    .order('created_at', { ascending: false })
  timing.measure('db_categories', databaseStartedAt)

  if (error) {
    return timing.attach(
      NextResponse.json({ error: error.message }, { status: 500 }),
    )
  }

  const transformStartedAt = performance.now()
  const categories = (data ?? []).map(categoryResponse)
  timing.measure('transform', transformStartedAt)
  return timing.attach(NextResponse.json(categories))
}

export async function POST(request: Request) {
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    return authorizationError(error)
  }

  try {
    const body = await request.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : ''
    const description = typeof body.description === 'string' ? body.description.trim() : null

    if (!name || name.length > 120 || !/^[a-z0-9-]+$/.test(slug) || slug.length > 160) {
      return NextResponse.json({ error: 'Tên hoặc đường dẫn danh mục không hợp lệ.' }, { status: 400 })
    }

    const { data, error } = await getSupabaseAdmin()
      .from('categories')
      .insert({ name, slug, description: description || null, is_active: body.isActive !== false })
      .select('id,name,slug,description,is_active,created_at,updated_at')
      .single()

    if (error) {
      const status = error.code === '23505' ? 409 : 400
      return NextResponse.json({ error: status === 409 ? 'Tên hoặc đường dẫn danh mục đã tồn tại.' : error.message }, { status })
    }

    return NextResponse.json(categoryResponse(data), { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Dữ liệu gửi lên không hợp lệ.' }, { status: 400 })
  }
}
