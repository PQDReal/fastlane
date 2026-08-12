import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('./054_remove_admin_accessory_drafts.sql', import.meta.url), 'utf8')

describe('remove server-side accessory drafts migration', () => {
  it('drops the obsolete server draft store after moving authoring to session cache', () => {
    expect(sql).toMatch(/drop table if exists public\.admin_accessory_drafts/i)
  })
})
