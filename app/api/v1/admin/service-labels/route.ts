import { NextResponse } from 'next/server'

import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import {
  mapServiceLabelRow,
  parseServiceLabelInput,
} from '@/lib/catalog/service-labels'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

function authorizationError(error: unknown) {
  if (error instanceof ApiAuthError) return authErrorResponse(error)
  throw error
}

export async function GET(request: Request) {
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    return authorizationError(error)
  }

  const supabase = getSupabaseAdmin()
  const [{ data: labels, error: labelsError }, { data: assignments, error: assignmentsError }] = await Promise.all([
    supabase
      .from('catalog_service_labels')
      .select('id,code,name,description,display_order,is_active,created_at,updated_at')
      .order('display_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('product_service_label_assignments')
      .select('service_label_id'),
  ])

  if (labelsError || assignmentsError) {
    return NextResponse.json(
      { error: labelsError?.message ?? assignmentsError?.message ?? 'Không thể tải nhãn dịch vụ.' },
      { status: 500 },
    )
  }

  const counts = new Map<string, number>()
  for (const assignment of assignments ?? []) {
    const id = String(assignment.service_label_id)
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }

  return NextResponse.json((labels ?? []).map((row) => (
    mapServiceLabelRow(row, counts.get(String(row.id)) ?? 0)
  )))
}

export async function POST(request: Request) {
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    return authorizationError(error)
  }

  try {
    const parsed = parseServiceLabelInput(await request.json())
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const input = parsed.value
    const { data, error } = await getSupabaseAdmin()
      .from('catalog_service_labels')
      .insert({
        code: input.code,
        name: input.name,
        description: input.description,
        display_order: input.displayOrder,
        is_active: input.isActive,
      })
      .select('id,code,name,description,display_order,is_active')
      .single()

    if (error) {
      const duplicate = error.code === '23505'
      return NextResponse.json(
        { error: duplicate ? 'Mã hoặc tên nhãn dịch vụ đã tồn tại.' : error.message },
        { status: duplicate ? 409 : 400 },
      )
    }

    return NextResponse.json(mapServiceLabelRow(data), { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Dữ liệu nhãn dịch vụ không hợp lệ.' }, { status: 400 })
  }
}
