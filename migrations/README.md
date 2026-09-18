# Database migrations

Apply migrations in filename order with a PostgreSQL owner connection or the Supabase SQL Editor.

For the accessory-shopping and dynamic product-options features:

1. Open the configured Supabase project.
2. Run the numbered SQL files in order. In an environment that already has a
   migration, resume with the next unapplied file; do not edit or re-run a
   historical migration to add new behavior.
3. Confirm the PostgREST schema exposes the seven-argument
   `/rpc/checkout_accessory_cart` created by `002` and replaced by `005`.
4. Run `npm run verify` before exercising checkout.

The dynamic options sequence is:

- `003_catalog_options_and_media.sql` creates the normalized option/media
  schema and adds order-item option snapshots.
- `004_catalog_options_hardening.sql` adds composite foreign-key indexes,
  audits existing rows, and validates the three checks introduced as
  `NOT VALID` by `003`. Its transaction aborts with row counts when preflight
  finds invalid data.
- `005_accessory_checkout_option_snapshot.sql` keeps selected-item partial
  checkout behavior and snapshots ordered variant option mappings atomically
  with the order-item insert. It also reconciles the selected-item identifier
  with the live `cart_items` schema: `p_cart_item_ids` contains variant UUIDs,
  because cart rows are keyed by `(cart_id, variant_id)` and have no `id`
  column. Every ownership, lock, pricing, insert, inventory, and partial-delete
  predicate is scoped by both the active cart and those variant UUIDs.
- `006_checkout_quantity_contract.sql` reconciles pre-existing database checks
  with the OpenAPI/runtime quantity contract. It preflights both cart and order
  rows, then atomically replaces and validates the named quantity checks as
  `1..99`; migration `001` could not replace same-named legacy `1..10` checks
  because its guards intentionally used `IF NOT EXISTS`.
- `007_catalog_read_permissions.sql` resets direct grants on the four
  normalized catalog tables. `anon` and `authenticated` retain `SELECT` only;
  the service-role importer retains full access for catalog replacement and
  backups. Application catalog consumers only read these relations.
- `008_finalize_order_snapshot_after_items.sql` fixes the checkout finalization
  order discovered by rollback-only live QA. It inserts all order-item
  snapshots while the parent is still mutable, then sets
  `snapshot_finalized_at`; this preserves the immutability trigger without
  blocking the initial item insert.
- `009_order_snapshot_guard_schema_drift.sql` makes the order immutability
  guard compatible with both current schemas and legacy schemas that still
  contain `showroom_id`. It avoids runtime field dereference while retaining
  the legacy field's immutability when present.
- `010_catalog_variant_legacy_cleanup.sql` removes the nullable legacy
  `product_variants.color` and `battery_option` columns only after a locked
  preflight proves they contain no data and no database object or stored
  function depends on them. Catalog scripts must be deployed first.
- `011_catalog_collections.sql` adds normalized vehicle models, source-stable
  hierarchical collections, and source-provenanced product memberships. It
  keeps the three root `categories` unchanged and grants public roles SELECT
  only through active-row RLS policies.
- `012_catalog_collection_fk_indexes.sql` adds full covering indexes for the
  two composite membership foreign keys. The active-row lookup indexes from
  `011` remain separate because partial indexes cannot cover FK maintenance.
- `013_accessory_service_labels.sql` normalizes the two reviewed accessory
  service labels and their 32 assignments. Public roles receive active-row
  reads only; atomic assignment replacement is service-role-only.
- `014_accessory_content_v1.sql` replaces only the 83 audited ACCESSORY
  `specifications` documents with the strict `accessory_content_v1` payload.
  Capture and checksum an exact legacy backup before applying it; its
  preflight requires the 110/83 catalog and the `013` assignment totals.
- `015_products_search_name_only.sql` rebuilds product search vectors from
  the unaccented product name only and narrows the write trigger to name
  changes while retaining the existing GIN index.
- `016_deposit_orders.sql` creates or hardens vehicle deposit persistence,
  server-owned order numbers, request idempotency, product references and the
  initial `PENDING_PAYMENT` state. Apply it before deploying the updated
  `/api/deposit` route.

Apply `013`, `014`, and `015` in that order. Do not run `014` without the
pre-deployment backup described at the bottom of that migration.

The taxonomy v2 rollout is intentionally staged:

1. Deploy the writer/verifier changes and run `npm run check:catalog-taxonomy`.
2. Review and apply `010`, then `011`; neither migration is applied by npm.
3. Run `npm run sync:catalog-taxonomy` for a read-only plan.
4. Run `npm run sync:catalog-taxonomy:apply` to upsert without deactivation.
5. Run `npm run verify:catalog-taxonomy` and the full `npm run verify` suite.
6. Only for a publication marked `COMPLETE`, use
   `npm run sync:catalog-taxonomy:reconcile` to soft-deactivate memberships
   absent from that publication. Failed/incomplete publications are rejected
   before any database connection or reconciliation.

The application never exposes the service-role key to the browser. The checkout RPC revokes direct execution from `public`, `anon`, and `authenticated`; only the server-side `service_role` may execute it.

The verified motorbike warranty rollout is intentionally separate from the after-sales crawler:

- `066_verified_motorbike_warranty_knowledge.sql` archives the mixed legacy warranty document and publishes the admin-reviewed motorbike policy with battery chemistry, invoice-date and issued-book context intact.
- The application links the three current warranty books and the current model-specific owner manuals directly from VinFast. Migration `066` does not ingest PDF contents.
- Apply `066` through the normal database migration workflow after deploying the code. A source-code commit does not mutate Supabase.

The unified admin inventory read-model rollout is staged separately:

- `057_admin_inventory_read_model.sql` adds the shared normalized search text,
  trigram and relationship indexes, and the service-role-only
  `admin_inventory_base` view. The view exposes one row per
  `product_variants` row, joins the optional vehicle configuration and
  inventory row, and emits the stable statuses `INACTIVE`, `UNLINKED`,
  `MISSING_INVENTORY`, `OUT_OF_STOCK`, `LOW_STOCK`, and `IN_STOCK`.
- The additive `/api/v1/admin/inventory/query` contract reads cursor pages and
  `/api/v1/admin/inventory/filter-options` reads stable metadata only when the
  selected product type/product changes. The legacy
  `/api/v1/admin/inventory` endpoint remains unchanged for existing consumers.
- `058_admin_product_summary_rpc.sql` is the additive follow-up for databases
  that already applied `057`. It installs
  `get_admin_product_inventory_summary(uuid[])`, the bounded summary RPC for
  `/admin/products`. It returns only one compact row per product, using the
  same vehicle identity rule as the legacy product summary. Do not rerun `057`
  to install this function. Apply `058` before this application version: the
  products API no longer falls back to loading full variant tables.
- `scripts/benchmark-admin-product-summary.sql` and
  `scripts/run-admin-product-summary-benchmark.ps1` create a disposable large
  PostgreSQL dataset, compare legacy/RPC results, and run `EXPLAIN ANALYZE` on
  both the raw-row and aggregate paths.

The public motorbike metadata rollout adds one follow-up migration:

- `059_published_motorbike_catalog_rpc.sql` joins active `products` with active
  `vehicle_variants` in one aggregate RPC. The application temporarily falls
  back to the previous RPC plus publication lookup until `059` is applied.
  Metadata is cached for five minutes and every admin vehicle write invalidates
  the matching Next cache tags and Redis key.

Rollback statements or guidance are included at the bottom of each migration
and must be reviewed before use on an environment containing orders. Migration
`004` intentionally retains validated checks on rollback because weakening
them would require dropping and recreating constraints. Migration `006`
includes a guarded rollback recipe because restoring `1..10` would reject any
quantities above 10 created after the contract is widened. Migration `007`
does not automatically restore broad public-role grants because RLS does not
protect `TRUNCATE`; its rollback guidance requires an explicit security review.
Migration `008` should be retained during application rollback because the
function ordering installed by `005` is incompatible with the live
`order_items_guard_snapshot` trigger.
Migration `009` should likewise be retained: its predecessor cannot execute
against an `orders` row type without `showroom_id`.
