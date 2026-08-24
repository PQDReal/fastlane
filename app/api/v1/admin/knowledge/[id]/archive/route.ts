import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import { archiveKnowledgeDocument } from '@/lib/sales-agent/knowledge/versioned-admin-repository'

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Yêu cầu quyền Quản trị viên.' }, { status: 403 })
    }

    const { id } = await context.params
    const document = await archiveKnowledgeDocument(id)

    return NextResponse.json({
      data: {
        document,
        message: 'Đã chuyển tài liệu vào trạng thái Lưu trữ và tạm ngưng tra cứu.',
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error?.message || 'Lỗi lưu trữ tài liệu.' },
      { status: 500 },
    )
  }
}
