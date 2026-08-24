import { NextResponse } from 'next/server'

import { getAfterSalesData } from '@/lib/api/after-sales-server'

export const revalidate = 300

export async function GET(request: Request) {
  const vehicle = new URL(request.url).searchParams.get('vehicle')
  if (vehicle !== 'car' && vehicle !== 'motorbike') {
    return NextResponse.json(
      { success: false, message: 'Loại xe không hợp lệ.' },
      { status: 400 },
    )
  }

  try {
    const data = await getAfterSalesData()
    const workshops = data.workshops.filter((workshop) => workshop.services.includes(vehicle))

    return NextResponse.json({
      success: true,
      data: workshops,
      releaseId: data.releaseId,
      sourcesSyncedAt: data.sourcesSyncedAt,
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Lỗi khi tải danh sách xưởng dịch vụ',
      },
      { status: 500 },
    )
  }
}
