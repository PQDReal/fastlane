import { NextResponse } from 'next/server'
import { getAfterSalesData } from '@/lib/api/after-sales-server'

export const revalidate = 300

export async function GET() {
  try {
    const data = await getAfterSalesData()
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || 'Lỗi khi tải dữ liệu dịch vụ hậu mãi' },
      { status: 500 },
    )
  }
}
