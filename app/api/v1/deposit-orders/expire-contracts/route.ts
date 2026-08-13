import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'

import { ApiRouteError, apiErrorResponse } from '@/lib/api/errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { notifyCustomerContractExpired } from '@/lib/notifications/server'
import { invalidateVehicleCatalogCaches } from '@/lib/catalog/vehicle-cache'

export async function POST(request: Request) {
  try {
    // Expiry is a mutation endpoint and always requires the cron secret.
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      throw new ApiRouteError(401, 'UNAUTHORIZED', 'Missing or invalid cron authorization token.')
    }

    const supabase = getSupabaseAdmin()
    const jobRunId = randomUUID()
    const { data: expiredOrders, error: expiryError } = await supabase.rpc(
      'expire_due_deposit_order_contracts',
      { p_job_run_id: jobRunId, p_limit: 100 },
    ) as {
      data: Array<{
        order_id: string
        order_number: string
        customer_id: string | null
        refund_status: string
        expired_at: string
      }> | null
      error: { message: string } | null
    }

    if (expiryError) {
      console.error('Failed to expire due contracts:', expiryError)
      throw new ApiRouteError(500, 'EXPIRY_FAILED', 'Không thể xử lý danh sách đơn cọc quá hạn.')
    }

    if (!expiredOrders || expiredOrders.length === 0) {
      return NextResponse.json({ message: 'Không có đơn đặt cọc nào quá hạn xác nhận tài liệu.', processedCount: 0 })
    }

    await invalidateVehicleCatalogCaches().catch((error) => {
      console.error('Unable to invalidate vehicle inventory caches after contract expiry:', error)
    })

    const results = []

    for (const order of expiredOrders) {
      if (order.customer_id) {
        await notifyCustomerContractExpired({
          customerId: order.customer_id,
          orderId: order.order_id,
          orderNumber: order.order_number,
        })
      }

      results.push({ id: order.order_id, status: 'EXPIRED', orderNumber: order.order_number, refundStatus: order.refund_status })
    }

    return NextResponse.json({
      message: `Đã xử lý tự động hủy ${results.length} đơn cọc quá hạn xác nhận tài liệu.`,
      processedCount: results.length,
      jobRunId,
      details: results,
    })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
