import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = fs.readFileSync(path.join(import.meta.dirname, '056_sales_agent_provider_configs.sql'), 'utf8')

describe('Sales Agent provider config migration', () => {
  it('keeps secrets out of database schema', () => {
    expect(sql).toMatch(/api_key_env varchar\(128\)/)
    expect(sql).not.toMatch(/api_key\s+(text|varchar|jsonb)/i)
    expect(sql).toMatch(/revoke all on table public\.sales_agent_provider_configs/i)
  })

  it('seeds the supported providers', () => {
    for (const provider of ['openai', 'anthropic', 'gemini', 'deepseek', 'openai-compatible']) {
      expect(sql).toMatch(new RegExp(`'${provider}'`))
    }
    expect(sql).toMatch(/'gpt-5\.6-luna'/)
  })
})
