import { NextResponse } from 'next/server'
import { requireCurrentCustomer } from '@/lib/api/customer'
import { ApiRouteError, apiErrorResponse } from '@/lib/api/errors'
import { parseItemId } from '@/lib/cart/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { tryAutoIssueContract } from '@/lib/deposit/contract-service'

type RouteContext = { params: Promise<{ orderId: string }> }

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentCustomer()
    if (user.role !== 'ADMIN') {
      throw new ApiRouteError(403, 'FORBIDDEN', 'Chỉ quản trị viên mới có quyền phát hành hợp đồng.')
    }

    const { orderId: rawOrderId } = await context.params
    const orderId = parseItemId(rawOrderId)
    const supabase = getSupabaseAdmin()

    const result = await tryAutoIssueContract(supabase, orderId, {
      actorType: 'ADMIN',
      actorUserId: user.id,
    })

    if (!result.success) {
      throw new ApiRouteError(409, 'CONTRACT_NOT_ISSUABLE', result.error || result.reason || 'Không thể phát hành hợp đồng.')
    }

    return NextResponse.json({
      data: result.data
    })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
