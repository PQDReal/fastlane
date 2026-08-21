# After-sales local admin reviewer

`npm run review:after-sales-admin` runs a read-only, deterministic reviewer on every fact in `public/data/after-sales-normalized.json`.

It produces two local-only files:

- `.local/after-sales/admin-review-report.json`: one review record for every normalized fact.
- `.local/after-sales/admin-review-queue.json`: only correction and human-review findings.

The reviewer never changes the normalized data, approval state, snapshots, or database. It is a release-control assistant, not an approval authority.

It verifies direct value evidence, official provenance, model scope anchoring, explicit `whichever_comes_first` parity, distance-policy ownership, interval completeness, existing semantic/admin holds, and cross-fact conflicts. A correction finding blocks approval; a human-review finding requires a reviewer decision; an auto-clear candidate still remains subject to the project approval workflow.
