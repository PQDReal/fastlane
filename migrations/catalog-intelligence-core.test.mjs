import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('./064_catalog_intelligence_core.sql', import.meta.url), 'utf8')

describe('catalog intelligence core migration', () => {
  it('is transactional and creates the provenance chain before canonical facts', () => {
    expect(migration.trimStart()).toMatch(/^begin;/)
    expect(migration.trimEnd()).toMatch(/-- commit;$/)
    expect(migration).toContain('create table public.catalog_spec_ingestion_jobs')
    expect(migration).toContain('create table public.catalog_spec_snapshots')
    expect(migration).toContain('create table public.catalog_spec_observations')
    expect(migration).toContain('create table public.product_spec_facts')
    expect(migration).toContain('selected_observation_id uuid not null')
    expect(migration).toContain('selection_policy_version varchar(80) not null')
  })

  it('uses one canonical motorbike product type', () => {
    expect(migration).toContain("check (product_type in ('*', 'CAR', 'MOTORBIKE', 'ACCESSORY'))")
    expect(migration).not.toContain("check (product_type in ('*', 'CAR', 'BIKE', 'MOTORBIKE', 'ACCESSORY'))")
    expect(migration).toContain("when 'BIKE' then 'MOTORBIKE'")
  })

  it('versions extraction, canonical selection and queue identity', () => {
    expect(migration).toContain("'catalog-extractor-v1'")
    expect(migration).toContain("'catalog-selection-v1'")
    expect(migration).toContain('unique (product_id, extractor_version, queue_fingerprint)')
    expect(migration).toContain('authoritative stable SHA-256')
  })

  it('claims jobs safely for concurrent workers', () => {
    expect(migration).toContain('create or replace function public.claim_catalog_spec_ingestion_jobs')
    expect(migration).toContain('for update skip locked')
    expect(migration).toContain("set status = 'PROCESSING'")
  })

  it('fails closed through constrained resolution and selection states', () => {
    expect(migration).toContain("'UNKNOWN_SPEC', 'AMBIGUOUS', 'INVALID_VALUE'")
    expect(migration).toContain("check (verification_status in ('AUTO', 'VERIFIED'))")
    expect(migration).toContain("'MANUAL_VERIFIED'")
    expect(migration).not.toContain("'MISSING_FACT'")
    expect(migration).not.toContain("'REMOVED_FACT'")
  })

  it('locks all intelligence tables to service-role access', () => {
    for (const table of [
      'catalog_spec_definitions',
      'catalog_spec_aliases',
      'catalog_runtime_revision',
      'catalog_spec_ingestion_jobs',
      'catalog_spec_snapshots',
      'catalog_spec_observations',
      'product_spec_facts',
      'catalog_intelligence_events',
    ]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`)
      expect(migration).toContain(`revoke all on table public.${table} from public, anon, authenticated`)
    }
  })
})
