import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import { publishKnowledgeDocument } from '@/lib/sales-agent/knowledge/repository'

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
    const result = await publishKnowledgeDocument(id)

    return NextResponse.json({
      data: {
        document: result.document,
        chunksCount: result.chunksCount,
        message: `Đã xuất bản phiên bản v${result.document.publishedVersion} với ${result.chunksCount} phân đoạn tri thức.`,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error?.message || 'Lỗi xuất bản tài liệu.' },
      { status: 500 },
    )
  }
}
