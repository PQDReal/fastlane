import { NextResponse } from 'next/server'

import { searchSalesAgentInteraction } from '@/lib/sales-agent/interactions/search'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const value = await request.json() as Record<string, unknown>
    const continuationToken = typeof value.continuationToken === 'string' ? value.continuationToken.slice(0, 8_192) : ''
    const conversationId = typeof value.conversationId === 'string' ? value.conversationId.slice(0, 120) : ''
    const query = typeof value.query === 'string' ? value.query.slice(0, 120) : undefined
    const selectedOptionIds = Array.isArray(value.selectedOptionIds)
      ? value.selectedOptionIds.filter((item): item is string => typeof item === 'string').map((item) => item.slice(0, 120)).slice(0, 8)
      : []
    if (!continuationToken || !conversationId) return NextResponse.json({ error: { code: 'INVALID_INTERACTION_SEARCH', message: 'Yêu cầu tìm kiếm lựa chọn không hợp lệ.' } }, { status: 400 })
    return NextResponse.json(await searchSalesAgentInteraction({ continuationToken, conversationId, query, selectedOptionIds }))
  } catch (error) {
    return NextResponse.json({ error: { code: 'INVALID_INTERACTION_SEARCH', message: error instanceof Error ? error.message : 'Không thể tìm lựa chọn lúc này.' } }, { status: 400 })
  }
}
