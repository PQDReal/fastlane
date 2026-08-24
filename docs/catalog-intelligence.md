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
- converts units with a code allow-list;
- prevents partial or lower-authority input from overwriting a current fact;
- never automatically overwrites a verified fact;
- includes extractor version in the stable SHA-256 input identity.

`MISSING_FACT` and `REMOVED_FACT` deliberately do not belong to ingestion.
They will be produced later by a separate coverage evaluator over complete
snapshots and category requirements.

## Dry-run audit

The audit is read-only. `--apply` is intentionally rejected until persistence
and parity gates are implemented.

```powershell
npm run catalog-intelligence:backfill
npm run catalog-intelligence:backfill -- --limit=10 --details
npm run catalog-intelligence:backfill -- --json --details
```

Baseline captured on 2026-08-24 against 112 active products:

| Metric | Count |
| --- | ---: |
| Raw observations | 658 |
| Resolved observations | 254 |
| Unknown observations retained | 400 |
| Ambiguous observations | 0 |
| Invalid values rejected | 4 |
| Extractor warnings | 83 |
| Database writes | 0 |

The four rejected values are intentionally fail-closed compound values: a
dual-battery capacity, alternative charging durations, a range interval and a
range conditional on installing two batteries. They need explicit canonical
policies rather than first-number parsing.

The 83 extractor warnings are active accessories that deliberately fail closed
because the first milestone registers vehicle technical schemas only. They are
not silently treated as complete; an accessory extractor will be introduced
only after its allowed technical sections and canonical vocabulary are frozen.

## Delivery order

1. Deterministic vocabulary, extractors, resolver, unit parser and selector.
2. Observation/fact persistence worker and idempotent backfill apply mode.
3. Legacy-versus-canonical shadow comparison.
4. Gradual FAQ, entity-resolution, comparison, ranking and search cutover.
5. Coverage evaluator and review workflow.
6. Optional LLM suggestions after real review decisions form a useful corpus.
