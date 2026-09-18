import { NextResponse } from 'next/server'

import { searchSalesAgentInteraction } from '@/lib/sales-agent/interactions/search'
import { recordSalesAgentDebugEvent } from '@/lib/sales-agent/debug-log'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const requestId = crypto.randomUUID()
  const startedAt = Date.now()
  try {
    const value = await request.json() as Record<string, unknown>
    const continuationToken = typeof value.continuationToken === 'string' ? value.continuationToken.slice(0, 8_192) : ''
    const conversationId = typeof value.conversationId === 'string' ? value.conversationId.slice(0, 120) : ''
    const query = typeof value.query === 'string' ? value.query.slice(0, 120) : undefined
    const selectedOptionIds = Array.isArray(value.selectedOptionIds)
      ? value.selectedOptionIds.filter((item): item is string => typeof item === 'string').map((item) => item.slice(0, 120)).slice(0, 8)
      : []
    if (!continuationToken || !conversationId) {
      recordSalesAgentDebugEvent('interaction.search.rejected', { requestId, conversationId: conversationId || undefined }, {
        phase: 'request_validation',
        reasonCode: 'MISSING_TOKEN_OR_CONVERSATION',
        selectedCount: selectedOptionIds.length,
        elapsedMs: Date.now() - startedAt,
      })
      return NextResponse.json({ error: { code: 'INVALID_INTERACTION_SEARCH', message: 'Yêu cầu tìm kiếm lựa chọn không hợp lệ.' } }, { status: 400 })
    }
    recordSalesAgentDebugEvent('interaction.search.started', { requestId, conversationId }, {
      queryPresent: Boolean(query),
      selectedCount: selectedOptionIds.length,
    })
    const result = await searchSalesAgentInteraction({ continuationToken, conversationId, query, selectedOptionIds })
    recordSalesAgentDebugEvent('interaction.search.completed', { requestId, conversationId }, {
      optionCount: result.options.length,
      selectedCount: selectedOptionIds.length,
      elapsedMs: Date.now() - startedAt,
    })
    return NextResponse.json(result, { headers: { 'X-Sales-Agent-Request-Id': requestId } })
  } catch (error) {
    recordSalesAgentDebugEvent('interaction.search.failed', { requestId }, {
      phase: 'interaction_search',
      reasonCode: 'SEARCH_ERROR',
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    })
    return NextResponse.json({ error: { code: 'INVALID_INTERACTION_SEARCH', message: error instanceof Error ? error.message : 'Không thể tìm lựa chọn lúc này.' } }, { status: 400 })
  }
}
