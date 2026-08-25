import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('./067_catalog_intelligence_persistence_rpc.sql', import.meta.url), 'utf8')

describe('catalog intelligence persistence RPC migration', () => {
  it('persists a complete provenance chain in one transaction', () => {
    expect(migration.trimStart()).toMatch(/^begin;/)
    expect(migration).toContain('create or replace function public.persist_catalog_intelligence_snapshot')
    expect(migration).toContain('insert into public.catalog_spec_ingestion_jobs')
    expect(migration).toContain('insert into public.catalog_spec_snapshots')
    expect(migration).toContain('insert into public.catalog_spec_observations')
    expect(migration).toContain('insert into public.catalog_spec_observation_candidates')
    expect(migration).toContain('insert into public.product_spec_facts')
    expect(migration).toContain('insert into public.catalog_intelligence_events')
    expect(migration).toMatch(/commit;[\s\S]*Rollback:/)
  })

  it('rejects incompatible runtime and payload versions', () => {
    expect(migration).toContain("payloadVersion')::integer, 0) <> 1")
    expect(migration).toContain('catalog runtime version mismatch')
    expect(migration).toContain('v_runtime.extractor_version <> v_extractor_version')
    expect(migration).toContain('v_runtime.selection_policy_version <> v_selection_policy_version')
  })

  it('is idempotent by the authoritative product and input hash', () => {
    expect(migration).toContain('snapshot.product_id = v_product_id')
    expect(migration).toContain('snapshot.input_hash = v_input_hash')
    expect(migration).toContain("'status', 'already_applied'")
    expect(migration).toContain('Recheck after the per-job lock')
    expect(migration).toContain('pg_advisory_xact_lock(hashtextextended(v_product_id::text, 0))')
  })

  it('does not overwrite verified, higher-authority or partial-snapshot facts', () => {
    expect(migration).toContain("v_current.verification_status = 'VERIFIED'")
    expect(migration).toContain("when 'MANUAL_VERIFIED' then 4")
    expect(migration).toContain("v_snapshot_completeness = 'PARTIAL'")
    expect(migration).toContain("'CONFLICT'")
  })

  it('only exposes the transaction to service role', () => {
    expect(migration).toContain("auth.role() is distinct from 'service_role'")
    expect(migration).toContain('revoke all on function public.persist_catalog_intelligence_snapshot(jsonb)')
    expect(migration).toContain('from public, anon, authenticated, service_role')
    expect(migration).toContain('grant execute on function public.persist_catalog_intelligence_snapshot(jsonb)')
  })
})
