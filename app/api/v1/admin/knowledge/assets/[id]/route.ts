import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import {
  createVisualKnowledgeAnnotationRevision,
  isVisualKnowledgeAdminEnabled,
} from '@/lib/sales-agent/knowledge/visual-admin-repository'

type RouteContext = { params: Promise<{ id: string }> }
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const IMAGE_TYPES = new Set(['DIAGRAM', 'PROCEDURE_STEP', 'SCREENSHOT', 'WARNING', 'CONTROL_LOCATION', 'TABLE_LEGEND', 'ICON_MARKER', 'PHOTO', 'OTHER'])
const RETRIEVAL_RECOMMENDATIONS = new Set(['INCLUDE', 'EXCLUDE', 'REVIEW'])

function cleanStringArray(value: unknown, maxItems: number): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null
  const cleaned = value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean)
  return cleaned.length <= maxItems ? [...new Set(cleaned)] : null
}

export async function PATCH(request: NextRequest, context: RouteContext) {
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
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const summary = typeof body.summary === 'string' ? body.summary.trim() : ''
    const keywords = cleanStringArray(body.keywords, 12)
    const visibleText = cleanStringArray(body.visibleText, 24)
    if (
      !UUID_PATTERN.test(id)
      || title.length < 1 || title.length > 120
      || summary.length < 1 || summary.length > 800
      || !keywords || !visibleText
      || !IMAGE_TYPES.has(body.imageType)
      || !RETRIEVAL_RECOMMENDATIONS.has(body.retrievalRecommendation)
      || typeof body.safetyCritical !== 'boolean'
    ) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Nội dung revision chú thích ảnh không hợp lệ.' }, { status: 400 })
    }

    const result = await createVisualKnowledgeAnnotationRevision({
      annotationId: id,
      title,
      summary,
      keywords,
      visibleText,
      imageType: body.imageType,
      retrievalRecommendation: body.retrievalRecommendation,
      safetyCritical: body.safetyCritical,
      actorId: user.id,
    })
    return NextResponse.json({ data: result })
  } catch (error: any) {
    const message = error?.message || 'Không thể tạo revision chú thích ảnh.'
    const lifecycleConflict = /NOT_EDITABLE|ANNOTATION_NOT_FOUND/i.test(message)
    return NextResponse.json(
      { error: lifecycleConflict ? 'LIFECYCLE_GATE' : 'VISUAL_REVISION_FAILED', message },
      { status: lifecycleConflict ? 409 : 500 },
    )
  }
}
