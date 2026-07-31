import { NextResponse } from 'next/server'

import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// PostgreSQL accepts the canonical 8-4-4-4-12 UUID shape without enforcing
// RFC version/variant bits. Existing category IDs follow that database contract.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

  const { searchParams } = new URL(request.url)
  const rootCategoryId = searchParams.get('rootCategoryId')?.trim()
  if (!rootCategoryId) {
    return NextResponse.json({ error: 'Thiếu danh mục sản phẩm gốc.' }, { status: 400 })
  }
  if (!UUID_PATTERN.test(rootCategoryId)) {
    return NextResponse.json({ error: 'Danh mục sản phẩm gốc không hợp lệ.' }, { status: 400 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('catalog_collections')
    .select('id,parent_id,kind,slug,name,display_order')
    .eq('root_category_id', rootCategoryId)
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json((data ?? []).map((collection) => ({
    id: collection.id,
    parentId: collection.parent_id,
    kind: collection.kind,
    slug: collection.slug,
    name: collection.name,
    displayOrder: collection.display_order,
  })))
}
