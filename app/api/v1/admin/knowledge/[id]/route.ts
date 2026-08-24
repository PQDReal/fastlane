import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import {
  deleteKnowledgeDocument,
  getKnowledgeDocumentById,
  updateKnowledgeDocument,
} from '@/lib/sales-agent/knowledge/versioned-admin-repository'

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Yêu cầu quyền Quản trị viên.' }, { status: 403 })
    }

    const { id } = await context.params
    const document = await getKnowledgeDocumentById(id)
    if (!document) {
      return NextResponse.json({ error: 'NOT_FOUND', message: 'Tài liệu không tồn tại.' }, { status: 404 })
    }

    return NextResponse.json({ data: { document } })
  } catch (error: any) {
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: error?.message || 'Lỗi lấy tài liệu.' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Yêu cầu quyền Quản trị viên.' }, { status: 403 })
    }

    const { id } = await context.params
    const body = await request.json()

    const document = await updateKnowledgeDocument(id, {
      title: body.title,
      category: body.category,
      contentMarkdown: body.contentMarkdown,
      summary: body.summary,
      authorId: user.id,
    })

    return NextResponse.json({ data: { document } })
  } catch (error: any) {
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: error?.message || 'Lỗi cập nhật tài liệu.' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Yêu cầu quyền Quản trị viên.' }, { status: 403 })
    }

    const { id } = await context.params
    const success = await deleteKnowledgeDocument(id, user.id)
    if (!success) {
      return NextResponse.json({ error: 'FAILED', message: 'Không thể xóa tài liệu.' }, { status: 500 })
    }

    return NextResponse.json({ data: { success: true, message: 'Đã xóa tài liệu và toàn bộ phân đoạn liên quan.' } })
  } catch (error: any) {
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: error?.message || 'Lỗi xóa tài liệu.' }, { status: 500 })
  }
}
