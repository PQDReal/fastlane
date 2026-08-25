# Catalog Intelligence FAQ cut-over — 2026-08-25

This milestone introduces the first guarded canonical consumer without changing
the default production answer path.

## Preflight

The deterministic backfill remained read-only and reported:

| Metric | Count |
| --- | ---: |
| Products | 112 |
| Raw observations | 658 |
| Resolved observations | 297 |
| Contextual facts | 304 |
| Unknown | 0 |
| Ambiguous | 0 |
| Invalid | 0 |
| Database writes | 0 |

The configured Supabase project returned `PGRST205` for
`catalog_spec_definitions`, `product_spec_facts` and `catalog_spec_snapshots`.
Migrations 064, 065 and 067 therefore still need the normal database deployment
before persistence or shadow activation.

## Runtime contract

`CATALOG_FACT_READ_MODE` has three fail-safe values:

| Mode | Canonical query | User answer |
| --- | --- | --- |
| `legacy` | No | Existing rule-engine fact |
| `shadow` | Eligible keys only | Existing fact, plus structured parity log |
| `canonical` | Eligible keys only | Exactly one canonical context |

The mode defaults to `legacy`. An unavailable canonical store falls back to the
existing answer. A reachable store with a missing or context-split canonical
fact fails closed instead of selecting the first value or hiding stale data.

Only `top_speed_kmh` is currently eligible. Range, battery capacity and power
remain on the legacy path until their shadow dispositions are resolved.

## Verification

The milestone adds tests for:

- invalid read-mode fallback;
- PostgREST canonical fact projection;
- unavailable-schema fallback;
- shadow match/mismatch classification;
- canonical selection for an eligible FAQ;
- refusal to cut over a held key;
- refusal to collapse multiple contexts;
- API response behavior and removal of internal facts from the public payload.
