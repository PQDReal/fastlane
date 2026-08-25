import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import { approveKnowledgeDocument } from '@/lib/sales-agent/knowledge/versioned-admin-repository'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Yêu cầu quyền Quản trị viên.' }, { status: 403 })
    }
    const { id } = await context.params
    const document = await approveKnowledgeDocument(id, user.id)
    return NextResponse.json({ data: { document, message: 'Đã phê duyệt phiên bản theo cơ chế maker-checker.' } })
  } catch (error: any) {
    const message = error?.message || 'Lỗi phê duyệt tài liệu.'
    const status = typeof message === 'string' && (message.includes('Maker-checker') || message.includes('Cannot approve')) ? 409 : 500
    return NextResponse.json({ error: status === 409 ? 'LIFECYCLE_GATE' : 'INTERNAL_ERROR', message }, { status })
  }
}
