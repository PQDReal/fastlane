import { NextResponse } from 'next/server'

import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

function authorizationError(error: unknown) {
  if (error instanceof ApiAuthError) return authErrorResponse(error)
  throw error
}

function categoryResponse(category: any) {
  return { ...category, isActive: category.is_active }
}

type Context = { params: Promise<{ categoryId: string }> }

export async function PATCH(request: Request, context: Context) {
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    return authorizationError(error)
  }

  try {
    const { categoryId } = await context.params
    const body = await request.json()
    const updates: Record<string, unknown> = {}

    if ('name' in body) {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name || name.length > 120) return NextResponse.json({ error: 'Tên danh mục không hợp lệ.' }, { status: 400 })
      updates.name = name
    }
    if ('slug' in body) {
      const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : ''
      if (!/^[a-z0-9-]+$/.test(slug) || slug.length > 160) return NextResponse.json({ error: 'Đường dẫn danh mục không hợp lệ.' }, { status: 400 })
      updates.slug = slug
    }
    if ('description' in body) updates.description = typeof body.description === 'string' ? body.description.trim() || null : null
    if ('isActive' in body) updates.is_active = body.isActive === true

    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Không có dữ liệu cần cập nhật.' }, { status: 400 })

    const { data, error } = await getSupabaseAdmin()
      .from('categories')
      .update(updates)
      .eq('id', categoryId)
      .select('id,name,slug,description,is_active,created_at,updated_at')
      .maybeSingle()

    if (error) {
      const status = error.code === '23505' ? 409 : 400
      return NextResponse.json({ error: status === 409 ? 'Tên hoặc đường dẫn danh mục đã tồn tại.' : error.message }, { status })
    }
    if (!data) return NextResponse.json({ error: 'Không tìm thấy danh mục.' }, { status: 404 })
    return NextResponse.json(categoryResponse(data))
  } catch {
    return NextResponse.json({ error: 'Dữ liệu gửi lên không hợp lệ.' }, { status: 400 })
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    return authorizationError(error)
  }

  const { categoryId } = await context.params
  const supabase = getSupabaseAdmin()
  const { count, error: countError } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', categoryId)

  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 })
  if ((count ?? 0) > 0) return NextResponse.json({ error: 'Không thể xóa danh mục đang có sản phẩm.' }, { status: 409 })

  const { data, error } = await supabase.from('categories').delete().eq('id', categoryId).select('id').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Không tìm thấy danh mục.' }, { status: 404 })
  return new Response(null, { status: 204 })
}
