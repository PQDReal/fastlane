# Catalog Intelligence deterministic core

Catalog Intelligence is being introduced as a shadow read model over
`products.specifications`. The current storefront JSON remains authoritative;
the assistant, search and ranking paths have not been cut over.

## Deterministic contract

Given the same canonical JSON input, extractor version, registry version and
selection-policy version, the engine must produce the same observations and
canonical selection. The core therefore:

- maps legacy `BIKE` input to the single `MOTORBIKE` type;
- reads only schema-approved technical zones;
- resolves exact path before exact scoped alias;
- returns `UNKNOWN_SPEC`, `AMBIGUOUS` or `INVALID_VALUE` instead of guessing;
- records reviewed `IGNORED` observations separately from unresolved data;
- blocks an exact stale source snapshot as `SOURCE_CONFLICT` before canonical promotion;
- converts units with a code allow-list;
- keeps ranges, tolerances, comparison operators and fact qualifiers typed;
- allows one observation to yield several context-specific candidates;
- prevents partial or lower-authority input from overwriting a current fact;
- never automatically overwrites a verified fact;
- includes extractor version in the stable SHA-256 input identity.

`MISSING_FACT` and `REMOVED_FACT` deliberately do not belong to ingestion.
They will be produced later by a separate coverage evaluator over complete
snapshots and category requirements.

## Dry-run audit

The default audit is read-only and remains the required preflight before any
persistence run.

```powershell
npm run catalog-intelligence:backfill
npm run catalog-intelligence:backfill -- --limit=10 --details
npm run catalog-intelligence:backfill -- --json --details
```

## Idempotent persistence

Migration `067_catalog_intelligence_persistence_rpc.sql` adds the service-role
RPC used by the backfill worker. One product snapshot is persisted in one
database transaction: job, immutable snapshot, observations, contextual
candidates, selected facts and review events either all commit or all roll
back.

The persistence boundary enforces these gates:

- payload, extractor and selection-policy versions must match the database;
- the same `(product_id, input_hash)` returns `already_applied` without writes;
- calls for the same product are serialized before canonical selection;
- an exact source-review hash can block observations before fact promotion;
- `VERIFIED`, higher-authority and partial-snapshot conflicts never overwrite
  the current fact;
- products with extractor warnings are skipped instead of being recorded as a
  falsely complete snapshot.

Deployment workflow:

```powershell
# 1. Apply migrations 064, 065 and 067 through the normal database deployment.
# 2. Reconfirm the current read-only report.
npm run catalog-intelligence:backfill -- --details

# 3. Start with a bounded apply and inspect the returned counters.
npm run catalog-intelligence:backfill:apply -- --limit=10 --details

# 4. Rerun the same command. Every successful prior snapshot must report
#    already_applied before expanding the limit.
npm run catalog-intelligence:backfill:apply -- --limit=10 --details
```

`catalog-intelligence:backfill:apply` is intentionally a separate command. The
existing `catalog-intelligence:backfill` script always supplies `--dry-run`, so
the audit command cannot accidentally write.

Current reviewed baseline captured on 2026-08-24 against 112 active products:

| Metric | Count |
| --- | ---: |
| Raw observations | 658 |
| Resolved observations | 297 |
| Contextual fact candidates | 304 |
| Ignored by reviewed policy | 20 |
| Blocked by official-source review | 341 |
| Unknown observations retained | 0 |
| Ambiguous observations | 0 |
| Invalid values rejected | 0 |
| Extractor warnings | 83 |
| Database writes | 0 |

The four former invalid values now have explicit policies: Kinet dual-battery
capacity, Kinet alternative charging durations, the VF 8 The All-New range
interval and Kyo range with two batteries. Contextual parsing also prevents
conditional auxiliary-battery ranges and trunk volumes from collapsing to the
first number.

The 341 blocked observations are not parser failures. They belong to 13 exact
source snapshots whose values conflict with the current official site, or for
which no current official source was found. A block binds to the canonical JSON
source hash, so a corrected payload is never blocked by an obsolete review.
See [the admin review](./catalog-intelligence-admin-review-2026-08-24.md).

The 83 extractor warnings are active accessories that deliberately fail closed
because the first milestone registers vehicle technical schemas only. They are
not silently treated as complete; an accessory extractor will be introduced
only after its allowed technical sections and canonical vocabulary are frozen.

## Delivery order

1. Deterministic vocabulary, extractors, resolver, unit parser and selector — complete.
2. Observation/fact persistence worker and idempotent backfill apply mode — implemented; migration deployment and bounded production apply remain operational steps.
3. Legacy-versus-canonical shadow comparison.
4. Gradual FAQ, entity-resolution, comparison, ranking and search cutover.
5. Coverage evaluator and review workflow.
6. Optional LLM suggestions after real review decisions form a useful corpus.
