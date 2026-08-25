import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import { publishKnowledgeDocument } from '@/lib/sales-agent/knowledge/versioned-admin-repository'

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
    const result = await publishKnowledgeDocument(id, user.id)

    return NextResponse.json({
      data: {
        document: result.document,
        chunksCount: result.chunksCount,
        message: `Đã xuất bản phiên bản v${result.document.publishedVersion} với ${result.chunksCount} phân đoạn tri thức.`,
      },
    })
  } catch (error: any) {
    const message = error?.message || 'Lỗi xuất bản tài liệu.'
    const status = typeof message === 'string' && (message.startsWith('PUBLISH_NOT_') || message.startsWith('SOURCE_REQUIRED')) ? 409 : 500
    return NextResponse.json({ error: status === 409 ? 'LIFECYCLE_GATE' : 'INTERNAL_ERROR', message }, { status })
  }
}
