import { NextResponse } from 'next/server'
import { catalogCacheEngine } from '@/lib/sales-agent/cache/catalog-cache'
import { invalidateProviderCache } from '@/lib/sales-agent/providers/registry'

export async function GET() {
  try {
    const status = catalogCacheEngine.getStatus()
    return NextResponse.json({ data: status })
  } catch (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Lỗi lấy trạng thái cache.' } },
      { status: 500 },
    )
  }
}

export async function POST() {
  try {
    invalidateProviderCache()
    const newSnapshot = await catalogCacheEngine.forceRefresh()
    const status = catalogCacheEngine.getStatus()
    return NextResponse.json({
      data: {
        message: 'Làm mới bộ nhớ đệm AI thành công.',
        status,
        refreshedAt: new Date(newSnapshot.lastRefreshedAt).toISOString(),
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: { code: 'REFRESH_FAILED', message: error instanceof Error ? error.message : 'Làm mới cache thất bại.' } },
      { status: 500 },
    )
  }
}
