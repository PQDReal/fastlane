# Database migrations

Apply migrations in filename order with a PostgreSQL owner connection or the Supabase SQL Editor.

For the accessory-shopping feature:

1. Open the configured Supabase project.
2. Run `001_accessory_checkout.sql` as one script.
3. Confirm the PostgREST schema exposes `/rpc/checkout_accessory_cart`.
4. Run `npm run verify` before exercising checkout.

The application never exposes the service-role key to the browser. The checkout RPC revokes direct execution from `public`, `anon`, and `authenticated`; only the server-side `service_role` may execute it.

Rollback statements are included at the bottom of each migration and must be reviewed before use on an environment containing orders.
