import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('./065_catalog_intelligence_contextual_facts.sql', import.meta.url), 'utf8')

describe('catalog intelligence contextual facts migration', () => {
  it('is transactional and versions the deterministic runtime contract', () => {
    expect(migration.trimStart()).toMatch(/^begin;/)
    expect(migration).toContain("extractor_version = 'catalog-extractor-v2'")
    expect(migration).toContain("selection_policy_version = 'catalog-selection-v2'")
    expect(migration.trim()).toMatch(/backup\.$/)
  })

  it('stores every candidate and keeps canonical facts unique by context', () => {
    expect(migration).toContain('create table public.catalog_spec_observation_candidates')
    expect(migration).toContain('comparison_operator varchar(10)')
    expect(migration).toContain('numeric_upper_value numeric')
    expect(migration).toContain('numeric_tolerance numeric')
    expect(migration).toContain("qualifiers jsonb not null default '[]'::jsonb")
    expect(migration).toContain("context_key text not null default 'default'")
    expect(migration).toContain('unique (observation_id, spec_definition_id, context_key)')
    expect(migration).toContain('product_spec_fact_product_context_uq')
    expect(migration).toContain('product_spec_fact_variant_context_uq')
  })

  it('models source review as a separate, immutable snapshot disposition', () => {
    expect(migration).toContain('create table public.catalog_source_reviews')
    expect(migration).toContain('unique (product_id, source_hash)')
    expect(migration).toContain("'VERIFIED', 'OFFICIAL_SOURCE_CONFLICT', 'NO_CURRENT_OFFICIAL_SOURCE'")
    expect(migration).toContain("'SOURCE_CONFLICT'")
  })

  it('locks both new tables to service-role access', () => {
    for (const table of ['catalog_spec_observation_candidates', 'catalog_source_reviews']) {
      expect(migration).toContain(`alter table public.${table} enable row level security`)
      expect(migration).toContain(`revoke all on table public.${table} from public, anon, authenticated`)
      expect(migration).toContain(`grant select, insert, update, delete on table public.${table} to service_role`)
    }
  })

  it('does not invent a Kinet standard-charger wattage', () => {
    expect(migration).toContain("alias.alias = 'Thời gian sạc tiêu chuẩn'")
    expect(migration).toContain('{"key":"charging_mode","value":"STANDARD"}')
    expect(migration).not.toMatch(/Thời gian sạc tiêu chuẩn[^;]*implicit_unit\s*=\s*['\"](?:400|1000)w/i)
  })
})
