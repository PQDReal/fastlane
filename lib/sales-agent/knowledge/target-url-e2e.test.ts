import { describe, expect, it, vi } from 'vitest'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
vi.mock('server-only', () => ({}))
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { HybridHierarchicalRetrievalService } from '@/lib/sales-agent/knowledge/retrieval/retrieval-service'
import { executeDataTool } from '@/lib/sales-agent/tools/definitions/index'
import { composeTurnResponse } from '@/lib/sales-agent/response/composer'
import { EvidenceLedger } from '@/lib/sales-agent/orchestrator/ledgers/evidence'
import { KnownEntityLedger } from '@/lib/sales-agent/orchestrator/ledgers/known-entities'

describe('Knowledge Target URL Resolution E2E', () => {
  it('retrieves knowledge for VF 5 and composes target_url navigation directly to user-manual', async () => {
    const client = getSupabaseAdmin()
    const retrievalService = new HybridHierarchicalRetrievalService(client)

    const result = await executeDataTool(
      'search_knowledge',
      {
        query: 'kích bình ắc quy xe VF 5',
        vehicleModel: 'VF 5',
        modelYear: 2024,
      },
      'call-test-vf5',
      {
        retrievalService,
        allowedVisualDrafts: true,
        knowledgeScope: {
          vehicleModel: 'VF 5',
          modelYear: 2024,
          bindingId: 'binding-vf5',
          isBindingAmbiguous: false,
        },
      }
    )

    expect(result.outcome).toBe('SUCCESS')
    expect(result.evidence.length).toBeGreaterThan(0)

    const targetUrlFact = result.evidence[0].facts.find((f: any) => f.factPath === 'targetUrl')
    expect(targetUrlFact?.valueHash).toBeTruthy()
    expect(targetUrlFact?.valueHash).toContain('/user-manual/')

    const evidence = new EvidenceLedger()
    evidence.recordToolResult('call-test-vf5', result)

    const response = composeTurnResponse({
      rawPlan: {
        schemaVersion: '2.0',
        outcome: 'ANSWER',
        narrative: [{
          kind: 'ADVICE',
          markdown: 'Khi kích bình ắc quy xe VF 5, quý khách cần kẹp đầu kẹp cực dương trước rồi mới kẹp cực âm.',
        }],
        views: [],
        suggestionIntents: [],
        actionIntents: [],
      },
      evidence,
      knownEntities: new KnownEntityLedger(),
      conversationRef: 'conv-test-1',
      turnId: 'turn-test-1',
      messageId: 'msg-test-1',
    })

    expect(response.answer.markdown).toContain(`[Hướng dẫn sử dụng VF 5 đời 2024](${targetUrlFact!.valueHash})`)
    const citationBlock = response.blocks.find((b) => b.kind === 'FACT_SUMMARY')
    expect(citationBlock?.kind === 'FACT_SUMMARY' ? citationBlock.facts[0].href : null)
      .toBe(targetUrlFact!.valueHash)
  }, 20000)

  it('retrieves knowledge for warranty/battery and composes target_url navigation directly to /after-sales', async () => {
    const client = getSupabaseAdmin()
    const retrievalService = new HybridHierarchicalRetrievalService(client)

    const result = await executeDataTool(
      'search_knowledge',
      {
        query: 'chính sách bảo hành pin VinFast',
        categories: ['WARRANTY_BATTERY'],
      },
      'call-test-warranty',
      {
        retrievalService,
        allowedVisualDrafts: true,
        knowledgeScope: {
          categories: ['WARRANTY_BATTERY'],
          isBindingAmbiguous: false,
        },
      }
    )

    expect(result.outcome).toBe('SUCCESS')
    expect(result.evidence.length).toBeGreaterThan(0)

    const targetUrlFact = result.evidence[0].facts.find((f: any) => f.factPath === 'targetUrl')
    expect(targetUrlFact?.valueHash).toBe('/after-sales')

    const evidence = new EvidenceLedger()
    evidence.recordToolResult('call-test-warranty', result)

    const response = composeTurnResponse({
      rawPlan: {
        schemaVersion: '2.0',
        outcome: 'ANSWER',
        narrative: [{
          kind: 'ADVICE',
          markdown: 'Chính sách bảo hành pin xe điện VinFast lên đến 10 năm hoặc 200.000 km.',
        }],
        views: [],
        suggestionIntents: [],
        actionIntents: [],
      },
      evidence,
      knownEntities: new KnownEntityLedger(),
      conversationRef: 'conv-test-2',
      turnId: 'turn-test-2',
      messageId: 'msg-test-2',
    })

    const citationBlock = response.blocks.find((b) => b.kind === 'FACT_SUMMARY')
    expect(citationBlock?.kind === 'FACT_SUMMARY' ? citationBlock.facts[0].href : null)
      .toBe('/after-sales')
  }, 20000)
})
