import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import { createKnowledgeDocument, listKnowledgeDocuments } from '@/lib/sales-agent/knowledge/versioned-admin-repository'
import type { KnowledgeCategory, KnowledgeStatus } from '@/lib/sales-agent/knowledge/types'

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Yêu cầu quyền Quản trị viên.' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') as KnowledgeCategory | null
    const status = searchParams.get('status') as KnowledgeStatus | null
    const search = searchParams.get('search') || undefined
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 20
    const offset = searchParams.get('offset') ? Number(searchParams.get('offset')) : 0

    const { documents, total } = await listKnowledgeDocuments({
      category: category || undefined,
      status: status || undefined,
      search,
      limit,
      offset,
    })

    return NextResponse.json({
      data: {
        documents,
        total,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error?.message || 'Lỗi xử lý tài liệu.' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Yêu cầu quyền Quản trị viên.' }, { status: 403 })
    }

    const body = await request.json()
    if (!body.title?.trim() || !body.category || !body.contentMarkdown?.trim()) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'Vui lòng nhập đầy đủ tiêu đề, danh mục và nội dung Markdown.' },
        { status: 400 },
      )
    }

    const document = await createKnowledgeDocument({
      title: body.title,
      slug: body.slug,
      category: body.category,
      contentMarkdown: body.contentMarkdown,
      summary: body.summary,
      authorEmail: user.email,
      authorId: user.id,
    })

    return NextResponse.json({
      data: { document },
    }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error?.message || 'Lỗi tạo tài liệu.' },
      { status: 500 },
    )
  }
}
