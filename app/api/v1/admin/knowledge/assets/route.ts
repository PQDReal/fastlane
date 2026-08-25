import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import {
  isVisualKnowledgeAdminEnabled,
  listVisualKnowledgeReviewItems,
} from '@/lib/sales-agent/knowledge/visual-admin-repository'
import type { VisualAnnotationStatus } from '@/lib/sales-agent/knowledge/types'

const STATUSES = new Set<VisualAnnotationStatus>(['AI_DRAFT', 'APPROVED', 'REJECTED'])

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Yêu cầu quyền Quản trị viên.' }, { status: 403 })
    }
    if (!isVisualKnowledgeAdminEnabled()) {
      return NextResponse.json({ error: 'FEATURE_DISABLED', message: 'Hàng chờ duyệt ảnh chưa được bật.' }, { status: 404 })
    }
    const params = new URL(request.url).searchParams
    const requestedStatus = (params.get('status') || 'AI_DRAFT') as VisualAnnotationStatus
    if (!STATUSES.has(requestedStatus)) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Trạng thái chú thích ảnh không hợp lệ.' }, { status: 400 })
    }
    const limit = params.get('limit') ? Number(params.get('limit')) : 20
    const offset = params.get('offset') ? Number(params.get('offset')) : 0
    if (!Number.isInteger(limit) || !Number.isInteger(offset) || limit < 1 || limit > 50 || offset < 0) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Phân trang hàng chờ duyệt ảnh không hợp lệ.' }, { status: 400 })
    }
    const result = await listVisualKnowledgeReviewItems({
      status: requestedStatus,
      search: params.get('search') || undefined,
      limit,
      offset,
    })
    return NextResponse.json({ data: result })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'VISUAL_REVIEW_LOAD_FAILED', message: error?.message || 'Không thể tải hàng chờ duyệt ảnh.' },
      { status: 500 },
    )
  }
}
