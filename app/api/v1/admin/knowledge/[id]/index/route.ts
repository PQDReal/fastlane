import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import { enqueueKnowledgeIndex } from '@/lib/sales-agent/knowledge/versioned-admin-repository'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Yêu cầu quyền Quản trị viên.' }, { status: 403 })
    }
    const body = await request.json().catch(() => ({}))
    const { id } = await context.params
    const result = await enqueueKnowledgeIndex(id, body.indexGenerationId)
    return NextResponse.json({ data: { ...result, message: 'Đã đưa phiên bản vào hàng đợi lập chỉ mục.' } }, { status: 202 })
  } catch (error: any) {
    const message = error?.message || 'Lỗi đưa tài liệu vào hàng đợi lập chỉ mục.'
    const status = typeof message === 'string' && (message.includes('VERSION_NOT_APPROVED') || message.includes('REVIEW_REQUIRED') || message.includes('SOURCE_REQUIRED')) ? 409 : 500
    return NextResponse.json({ error: status === 409 ? 'LIFECYCLE_GATE' : 'INTERNAL_ERROR', message }, { status })
  }
}
