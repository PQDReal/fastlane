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
