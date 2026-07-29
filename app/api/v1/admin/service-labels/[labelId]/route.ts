import { NextResponse } from 'next/server'

import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import {
  mapServiceLabelRow,
  parseServiceLabelInput,
} from '@/lib/catalog/service-labels'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type Context = { params: Promise<{ labelId: string }> }

function authorizationError(error: unknown) {
  if (error instanceof ApiAuthError) return authErrorResponse(error)
  throw error
}

export async function PATCH(request: Request, context: Context) {
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    return authorizationError(error)
  }

  try {
    const { labelId } = await context.params
    const supabase = getSupabaseAdmin()
    const [{ data: existing, error: existingError }, body] = await Promise.all([
      supabase
        .from('catalog_service_labels')
        .select('id,code,name,description,display_order,is_active')
        .eq('id', labelId)
        .maybeSingle(),
      request.json(),
    ])

    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
    if (!existing) return NextResponse.json({ error: 'Không tìm thấy nhãn dịch vụ.' }, { status: 404 })
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Dữ liệu nhãn dịch vụ không hợp lệ.' }, { status: 400 })
    }

    const patch = body as Record<string, unknown>
    const allowedKeys = new Set(['code', 'name', 'description', 'displayOrder', 'isActive'])
    const patchKeys = Object.keys(patch)
    if (patchKeys.length === 0 || patchKeys.some((key) => !allowedKeys.has(key))) {
      return NextResponse.json({ error: 'Dữ liệu nhãn dịch vụ chứa trường không được hỗ trợ.' }, { status: 400 })
    }
    const parsed = parseServiceLabelInput({
      code: 'code' in patch ? patch.code : existing.code,
      name: 'name' in patch ? patch.name : existing.name,
      description: 'description' in patch ? patch.description : existing.description,
      displayOrder: 'displayOrder' in patch ? patch.displayOrder : existing.display_order,
      isActive: 'isActive' in patch ? patch.isActive : existing.is_active,
    })
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const input = parsed.value
    const { data, error } = await supabase
      .from('catalog_service_labels')
      .update({
        code: input.code,
        name: input.name,
        description: input.description,
        display_order: input.displayOrder,
        is_active: input.isActive,
      })
      .eq('id', labelId)
      .select('id,code,name,description,display_order,is_active')
      .maybeSingle()

    if (error) {
      const duplicate = error.code === '23505'
      return NextResponse.json(
        { error: duplicate ? 'Mã hoặc tên nhãn dịch vụ đã tồn tại.' : error.message },
        { status: duplicate ? 409 : 400 },
      )
    }
    if (!data) return NextResponse.json({ error: 'Không tìm thấy nhãn dịch vụ.' }, { status: 404 })
    return NextResponse.json(mapServiceLabelRow(data))
  } catch {
    return NextResponse.json({ error: 'Dữ liệu nhãn dịch vụ không hợp lệ.' }, { status: 400 })
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    return authorizationError(error)
  }

  const { labelId } = await context.params
  const supabase = getSupabaseAdmin()
  const { count, error: countError } = await supabase
    .from('product_service_label_assignments')
    .select('product_id', { count: 'exact', head: true })
    .eq('service_label_id', labelId)

  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 })
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'Không thể xóa nhãn đang được gán cho phụ kiện. Hãy tạm ngừng nhãn thay vì xóa.' },
      { status: 409 },
    )
  }

  const { data, error } = await supabase
    .from('catalog_service_labels')
    .delete()
    .eq('id', labelId)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Không tìm thấy nhãn dịch vụ.' }, { status: 404 })
  return new Response(null, { status: 204 })
}
