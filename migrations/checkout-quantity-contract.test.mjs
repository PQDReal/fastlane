import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '006_checkout_quantity_contract.sql'),
  'utf8',
)

describe('checkout quantity contract migration', () => {
  it('preflights both tables before replacing their named checks with 1..99', () => {
    const preflightEnd = migration.indexOf('$quantity_contract$;')
    const firstDrop = migration.indexOf('drop constraint if exists')

    expect(preflightEnd).toBeGreaterThan(-1)
    expect(preflightEnd).toBeLessThan(firstDrop)
    expect(migration).toMatch(
      /from public\.cart_items\s+where quantity not between 1 and 99;/i,
    )
    expect(migration).toMatch(
      /from public\.order_items\s+where quantity not between 1 and 99;/i,
    )

    for (const [table, constraint] of [
      ['cart_items', 'cart_items_quantity_valid'],
      ['order_items', 'order_items_quantity_valid'],
    ]) {
      const activeSql = migration.slice(0, migration.indexOf('-- Rollback guidance'))
      expect(activeSql).toMatch(new RegExp(
        `alter table public\\.${table}\\s+drop constraint if exists ${constraint};`,
        'i',
      ))
      expect(activeSql).toMatch(new RegExp(
        `alter table public\\.${table}\\s+add constraint ${constraint}\\s+check \\(quantity between 1 and 99\\) not valid;`,
        'i',
      ))
      expect(activeSql).toMatch(new RegExp(
        `alter table public\\.${table}\\s+validate constraint ${constraint};`,
        'i',
      ))
    }
  })

  it('documents a guarded rollback to the prior 1..10 contract', () => {
    const rollback = migration.slice(migration.indexOf('-- Rollback guidance'))

    expect(rollback).toMatch(/quantity not between 1 and 10/)
    expect(rollback.match(/check \(quantity between 1 and 10\) not valid;/g))
      .toHaveLength(2)
    expect(rollback.match(/validate constraint (?:cart_items|order_items)_quantity_valid;/g))
      .toHaveLength(2)
  })
})
