import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import {
  bulkReviewVisualKnowledgeAnnotations,
  isVisualKnowledgeAdminEnabled,
} from '@/lib/sales-agent/knowledge/visual-admin-repository'

const REVIEW_STATUSES = new Set(['APPROVED', 'REJECTED'])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Yêu cầu quyền Quản trị viên.' }, { status: 403 })
    }
    if (!isVisualKnowledgeAdminEnabled()) {
      return NextResponse.json({ error: 'FEATURE_DISABLED', message: 'Hàng chờ duyệt ảnh chưa được bật.' }, { status: 404 })
    }

    const body = await request.json()
    const rawAnnotationIds: unknown[] = Array.isArray(body.annotationIds) ? body.annotationIds : []
    const annotationIds: string[] = [...new Set(
      rawAnnotationIds.filter((id): id is string => typeof id === 'string'),
    )]
    const note = typeof body.note === 'string' ? body.note.trim() : ''
    if (
      annotationIds.length < 1 || annotationIds.length > 50
      || annotationIds.some((id) => !UUID_PATTERN.test(id))
      || !REVIEW_STATUSES.has(body.status)
      || note.length > 1_000
    ) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Yêu cầu duyệt ảnh hàng loạt không hợp lệ.' }, { status: 400 })
    }

    const result = await bulkReviewVisualKnowledgeAnnotations({
      annotationIds,
      status: body.status,
      actorId: user.id,
      note: note || null,
    })
    return NextResponse.json({ data: result })
  } catch (error: any) {
    const message = error?.message || 'Không thể duyệt hàng loạt chú thích ảnh.'
    const lifecycleConflict = /MAKER_CHECKER|NOT_REVIEWABLE|STATUS_TRANSITION|BULK_REVIEW/i.test(message)
    return NextResponse.json(
      { error: lifecycleConflict ? 'LIFECYCLE_GATE' : 'VISUAL_BULK_REVIEW_FAILED', message },
      { status: lifecycleConflict ? 409 : 500 },
    )
  }
}
