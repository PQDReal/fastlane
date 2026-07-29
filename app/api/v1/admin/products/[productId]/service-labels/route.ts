import { NextResponse } from 'next/server'

import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { parseServiceLabelIds } from '@/lib/catalog/service-labels'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type Context = { params: Promise<{ productId: string }> }

function authorizationError(error: unknown) {
  if (error instanceof ApiAuthError) return authErrorResponse(error)
  throw error
}

export async function PUT(request: Request, context: Context) {
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    return authorizationError(error)
  }

  try {
    const [{ productId }, body] = await Promise.all([context.params, request.json()])
    const labelIds = parseServiceLabelIds(
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>).serviceLabelIds
        : null,
    )
    if (labelIds === null) {
      return NextResponse.json({ error: 'Danh sách nhãn dịch vụ không hợp lệ.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { error } = await supabase.rpc('replace_product_service_labels', {
      target_product_id: productId,
      target_service_label_ids: labelIds,
    })

    if (error) {
      const isRuleError = error.code === '23514'
      return NextResponse.json(
        { error: isRuleError ? error.message : 'Không thể cập nhật nhãn dịch vụ cho phụ kiện.' },
        { status: isRuleError ? 400 : 500 },
      )
    }

    const { data, error: readError } = await supabase
      .from('product_service_label_assignments')
      .select('service_label_id')
      .eq('product_id', productId)

    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
    return NextResponse.json({
      productId,
      serviceLabelIds: (data ?? []).map((assignment) => String(assignment.service_label_id)),
    })
  } catch {
    return NextResponse.json({ error: 'Dữ liệu gán nhãn dịch vụ không hợp lệ.' }, { status: 400 })
  }
}
