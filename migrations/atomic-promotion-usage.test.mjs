import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = fs.readFileSync(
  new URL('./033_atomic_promotion_usage.sql', import.meta.url),
  'utf8',
)

describe('atomic promotion usage migration', () => {
  it('increments usage with one conditional update', () => {
    expect(sql).toMatch(/update public\.promotions[\s\S]*used_count\s*=\s*used_count\s*\+\s*1/i)
    expect(sql).toMatch(/usage_limit is null or used_count < usage_limit/i)
  })

  it('does not expose the privileged RPC to public callers', () => {
    expect(sql).toMatch(/security definer/i)
    expect(sql).toMatch(/revoke all[\s\S]*from public/i)
    expect(sql).toMatch(/grant execute[\s\S]*to service_role/i)
  })
})

