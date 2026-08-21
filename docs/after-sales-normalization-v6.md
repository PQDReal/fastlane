# After-sales normalization fixes — schema v6

## Commands

```powershell
npm run rebuild:after-sales-normalized -- `
  public/data/after-sales-normalized.json `
  .local/after-sales/after-sales-normalized-v6.json `
  scripts/data/after-sales-source-manifest.json

npm run test:after-sales-normalization

npm run validate:after-sales-normalized-v6
npm run review:after-sales-admin

npm run build:after-sales-review -- `
  --normalized=.local/after-sales/after-sales-normalized-v6.json

# Recapture interactive DOM content before rebuilding v6
npm run process:after-sales:raw-recapture
```

## Changes

- Evidence context preserves exact source slices and declares its raw DOM/PDF anchor.
- Legacy excerpts are reindexed explicitly instead of presenting old offsets as verified raw-source offsets.
- Semantic parsing recognizes whichever-comes-first, unlimited-distance and component-level subject hints.
- Model, powertrain and usage fields are normalized before identity generation.
- Every model named in a list is expanded into model-scoped facts.
- Model scope can be restored from official asset filenames.
- Known component and promotion classification defects are corrected.
- The ungrounded annual key-fob fact is removed.
- Semantic duplicates are merged before canonical IDs are recomputed.
- Vehicle and high-voltage-battery warranty sections are bound independently, including flattened web tables.
- Numeric intervals retain structured event alternatives in `alternativeTriggers` instead of inventing numeric values.
- Every provenance stores `sourceValueText`; equivalent source durations such as `12 tháng` and normalized `1 năm` can merge without weakening raw-offset validation.
- Review/import projections preserve `reviewReasons`, `publicationStatus` and `supersedesFactIds`.

## Delegated admin-review agent

`review:after-sales-admin` performs a deterministic, read-only review of every v6 fact. It checks direct value evidence, official-source provenance, model anchoring, qualifier support, interval completeness and cross-fact conflicts.

The command writes:

- `.local/after-sales/admin-review-report.json`: complete per-fact decisions and findings.
- `.local/after-sales/admin-review-queue.json`: only blocker or human-review items.

`READY_FOR_APPROVAL` means the delegated review queue is empty. It does not change approval records, authorize publication or substitute for the final explicit human-admin action.

## Raw recapture and publication hold

The raw-recapture command opens each approved source through the managed browser, expands interactive controls and vehicle tabs, and stores the full raw DOM state in `.local/after-sales/snapshots/<source-id>/`. PDF evidence is anchored to the exact extracted page text and verified asset hash.

For maintenance prose, an explicit sentence whose subject is `Bảo dưỡng xe ... VinFast` is normalized as a vehicle-level scheduled service. Component names from a preceding checklist (for example `Ắc quy 12V`) must not leak into that sentence's subject binding.

The v6 validator independently resolves every machine provenance back to the raw DOM text or PDF page and checks the indexed slices. Evidence with `offsetBasis=serialized_excerpt_utf16` or without `sourceAnchor` is a hard rejection. Manually transcribed facts remain `pending_admin_review`.

When raw evidence is complete, v6 gets `publicationStatus=pending_admin_approval`; it is still not published automatically. `build:after-sales-review -- --normalized=.local/after-sales/after-sales-normalized-v6.json` is blocked unless the raw gate passes. Until then the dataset remains `hold_raw_recrawl_required`.
