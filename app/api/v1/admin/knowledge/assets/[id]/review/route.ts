import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import {
  isVisualKnowledgeAdminEnabled,
  reviewVisualKnowledgeAnnotation,
} from '@/lib/sales-agent/knowledge/visual-admin-repository'

type RouteContext = { params: Promise<{ id: string }> }
const REVIEW_STATUSES = new Set(['APPROVED', 'REJECTED'])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Yêu cầu quyền Quản trị viên.' }, { status: 403 })
    }
    if (!isVisualKnowledgeAdminEnabled()) {
      return NextResponse.json({ error: 'FEATURE_DISABLED', message: 'Hàng chờ duyệt ảnh chưa được bật.' }, { status: 404 })
    }
    const { id } = await context.params
    const body = await request.json()
    if (!UUID_PATTERN.test(id) || !REVIEW_STATUSES.has(body.status)) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Yêu cầu duyệt ảnh không hợp lệ.' }, { status: 400 })
    }
    const note = typeof body.note === 'string' ? body.note.trim() : ''
    if (note.length > 1_000) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Ghi chú duyệt tối đa 1.000 ký tự.' }, { status: 400 })
    }
    const result = await reviewVisualKnowledgeAnnotation({
      annotationId: id,
      status: body.status,
      actorId: user.id,
      note: note || null,
    })
    return NextResponse.json({ data: result })
  } catch (error: any) {
    const message = error?.message || 'Không thể cập nhật trạng thái duyệt ảnh.'
    const lifecycleConflict = /MAKER_CHECKER|NOT_REVIEWABLE|STATUS_TRANSITION/i.test(message)
    return NextResponse.json(
      { error: lifecycleConflict ? 'LIFECYCLE_GATE' : 'VISUAL_REVIEW_FAILED', message },
      { status: lifecycleConflict ? 409 : 500 },
    )
  }
}
