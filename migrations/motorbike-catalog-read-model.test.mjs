import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'migrations', '031_motorbike_catalog_read_model.sql'),
  'utf8',
)

describe('motorbike catalog read model migration', () => {
  it('aggregates active BIKE rows by product', () => {
    expect(sql).toMatch(/product_type\s*=\s*'BIKE'/i)
    expect(sql).toMatch(/is_active\s*=\s*true/i)
    expect(sql).toMatch(/group\s+by\s+vehicle_variants\.product_id/i)
  })

  it('returns shared specs separately from variant rows', () => {
    expect(sql).toMatch(/shared_specs\s+jsonb/i)
    expect(sql).toMatch(/variants\s+jsonb/i)
    expect(sql).toMatch(/jsonb_agg/i)
  })

  it('adds a catalog query index', () => {
    expect(sql).toMatch(/idx_vehicle_variants_bike_catalog/i)
  })
})
