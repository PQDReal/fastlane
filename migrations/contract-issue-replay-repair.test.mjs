import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('./047_repair_contract_issue_replay.sql', import.meta.url),
  'utf8',
)

describe('contract issue replay forward repair migration', () => {
  it('replaces the issue RPC and rejects stale document replay', () => {
    expect(sql).toContain('create or replace function public.issue_deposit_order_contract')
    expect(sql).toContain("v_document.status <> 'PENDING_SIGNATURE'")
    expect(sql).toContain('CONTRACT_ISSUE_EVENT_DOCUMENT_INACTIVE')
  })

  it('keeps the issue RPC service-only', () => {
    expect(sql).toMatch(/revoke all on function public\.issue_deposit_order_contract[\s\S]+from public, anon, authenticated/i)
    expect(sql).toMatch(/grant execute on function public\.issue_deposit_order_contract[\s\S]+to service_role/i)
  })
})
