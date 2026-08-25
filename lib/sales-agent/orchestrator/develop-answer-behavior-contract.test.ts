import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const routeSource = readFileSync(join(root, 'app/api/v1/sales-agent/messages/route.ts'), 'utf8')
const runTurnSource = readFileSync(join(root, 'lib/sales-agent/orchestrator/run-turn.ts'), 'utf8')
const promptSource = readFileSync(join(root, 'lib/sales-agent/prompt/manifest.ts'), 'utf8')
const toolSource = readFileSync(join(root, 'lib/sales-agent/tools/definitions/index.ts'), 'utf8')

describe('develop answer behavior with after-sales data integration', () => {
  it('streams model deltas directly and lets the model compose the grounded answer', () => {
    expect(routeSource).toContain('onTextDelta: (delta) =>')
    expect(runTurnSource).toContain('options.onTextDelta?.(delta)')
    expect(routeSource).not.toContain('chunkGroundedMarkdown')
    expect(runTurnSource).not.toContain('deterministicPrefetchSucceeded')
    expect(runTurnSource).not.toContain('buildDeterministicToolMarkdown')
  })

  it('preserves the develop formatting and image-selection instructions', () => {
    expect(promptSource).toContain('LỰA CHỌN VÀ CHÈN HÌNH ẢNH')
    expect(promptSource).toContain('CHỦ ĐỘNG CHÈN ẢNH')
    expect(promptSource).toContain('MỖI LẦN trả lời')
    expect(promptSource).toContain('[{"label": "Tên nút gợi ý"')
  })

  it('keeps link-only PDF metadata explicit without replacing develop composition', () => {
    expect(promptSource).toContain('không hỏi lại đời xe')
    expect(promptSource).toContain('nội dung chưa được ingest')
    expect(promptSource).toContain('đúng `sourceUrl`')
    expect(promptSource).toContain('đúng `internalUrl`')
  })

  it('adds after-sales tools without forcing manual behavior away from develop', () => {
    expect(runTurnSource).toContain('requiredAfterSalesLookup(userText)')
    expect(runTurnSource).toContain('requiresWarrantyKnowledgeLookup(userText)')
    expect(runTurnSource).not.toContain('requiresManualLookup')
    expect(toolSource).toContain("case 'search_after_sales'")
    expect(toolSource).toContain("case 'find_service_locations'")
  })
})
