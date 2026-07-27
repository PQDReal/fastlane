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

The application never exposes the service-role key to the browser. The checkout RPC revokes direct execution from `public`, `anon`, and `authenticated`; only the server-side `service_role` may execute it.

Rollback statements or guidance are included at the bottom of each migration
and must be reviewed before use on an environment containing orders. Migration
`004` intentionally retains validated checks on rollback because weakening
them would require dropping and recreating constraints.
