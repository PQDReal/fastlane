-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  auth0_subject text NOT NULL UNIQUE CHECK (btrim(auth0_subject) <> ''::text),
  email text NOT NULL CHECK (email = lower(email)),
  full_name text NOT NULL CHECK (btrim(full_name) <> ''::text),
  phone_number text CHECK (phone_number IS NULL OR btrim(phone_number) <> ''::text),
  role USER-DEFINED NOT NULL DEFAULT 'CUSTOMER'::app_role,
  created_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT users_pkey PRIMARY KEY (id)
);
CREATE TABLE public.categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (btrim(name) <> ''::text),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text),
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT categories_pkey PRIMARY KEY (id)
);
CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL,
  product_type USER-DEFINED NOT NULL,
  name text NOT NULL CHECK (btrim(name) <> ''::text),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text),
  description text,
  specifications jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(specifications) = 'object'::text),
  image_urls jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(image_urls) = 'array'::text),
  search_vector tsvector,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT products_pkey PRIMARY KEY (id),
  CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id)
);
CREATE TABLE public.product_variants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  sku text NOT NULL UNIQUE CHECK (sku = upper(sku) AND btrim(sku) <> ''::text),
  name text NOT NULL CHECK (btrim(name) <> ''::text),
  color text,
  battery_option text,
  original_price numeric NOT NULL CHECK (original_price >= 0::numeric),
  sale_price numeric,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT product_variants_pkey PRIMARY KEY (id),
  CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.inventory_items (
  showroom_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  on_hand_quantity integer NOT NULL DEFAULT 0 CHECK (on_hand_quantity >= 0),
  updated_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT inventory_items_pkey PRIMARY KEY (showroom_id, variant_id),
  CONSTRAINT inventory_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id)
);
CREATE TABLE public.carts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'ACTIVE'::cart_status,
  created_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT carts_pkey PRIMARY KEY (id),
  CONSTRAINT carts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.users(id)
);
CREATE TABLE public.cart_items (
  cart_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 1 AND quantity <= 10),
  CONSTRAINT cart_items_pkey PRIMARY KEY (cart_id, variant_id),
  CONSTRAINT cart_items_cart_id_fkey FOREIGN KEY (cart_id) REFERENCES public.carts(id),
  CONSTRAINT cart_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id)
);
CREATE TABLE public.promotions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code = upper(code) AND btrim(code) <> ''::text),
  name text NOT NULL CHECK (btrim(name) <> ''::text),
  type USER-DEFINED NOT NULL,
  value numeric NOT NULL,
  starts_at timestamp with time zone NOT NULL,
  ends_at timestamp with time zone NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT promotions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_number text NOT NULL DEFAULT app_private.generate_order_number() UNIQUE,
  customer_id uuid NOT NULL,
  source_cart_id uuid UNIQUE,
  showroom_id uuid NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'PENDING'::order_status,
  idempotency_key text NOT NULL CHECK (btrim(idempotency_key) <> ''::text),
  request_hash text NOT NULL CHECK (btrim(request_hash) <> ''::text),
  mock_payment_reference text,
  subtotal numeric NOT NULL,
  battery_rental_fee numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL,
  promotion_code_snapshot text,
  shipping_address jsonb NOT NULL CHECK (jsonb_typeof(shipping_address) = 'object'::text),
  cancellation_reason text,
  snapshot_finalized_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  promotion_id uuid,
  CONSTRAINT orders_pkey PRIMARY KEY (id),
  CONSTRAINT orders_promotion_fk FOREIGN KEY (promotion_id) REFERENCES public.promotions(id),
  CONSTRAINT orders_cart_customer_fk FOREIGN KEY (source_cart_id) REFERENCES public.carts(id),
  CONSTRAINT orders_cart_customer_fk FOREIGN KEY (customer_id) REFERENCES public.carts(customer_id),
  CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.users(id)
);
CREATE TABLE public.order_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  product_type_snapshot USER-DEFINED NOT NULL,
  sku_snapshot text NOT NULL,
  product_name_snapshot text NOT NULL,
  variant_name_snapshot text NOT NULL,
  unit_price numeric NOT NULL CHECK (unit_price >= 0::numeric),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 1 AND quantity <= 10),
  line_subtotal numeric NOT NULL,
  assigned_vin text,
  created_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT order_items_pkey PRIMARY KEY (id),
  CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id),
  CONSTRAINT order_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id)
);
CREATE TABLE public.reservations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  showroom_id uuid NOT NULL,
  variant_id uuid,
  type USER-DEFINED NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'PENDING'::reservation_status,
  scheduled_at timestamp with time zone NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 30 CHECK (duration_minutes >= 15 AND duration_minutes <= 180),
  customer_note text,
  cancellation_reason text,
  converted_order_id uuid UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT reservations_pkey PRIMARY KEY (id),
  CONSTRAINT reservations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.users(id),
  CONSTRAINT reservations_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id),
  CONSTRAINT reservations_converted_order_id_fkey FOREIGN KEY (converted_order_id) REFERENCES public.orders(id)
);---
title: 'Rename the Customer authorization role to User'
type: 'refactor'
created: '2026-07-23'
status: 'done'
baseline_commit: '2e1eed97fe1219f3167bee1eb1033cea8ad12c21'
context:
  - 'docs/auth0-supabase.md'
  - 'docs/agent/DATABASE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The team has renamed the non-admin authorization role from Customer to User, but FastLane currently mixes `Customer/customer/CUSTOMER` and `User/user`, causing rejected tokens, failed tests, and invalid Supabase enum writes when layers disagree.

**Approach:** Adopt one role contract end to end: Auth0 role `User`, namespaced token value `user`, and `public.users.role` enum value `USER`; retain `Admin/admin/ADMIN`. Migrate existing enum values and update tests, OpenAPI metadata, and operator documentation in the same change.

## Boundaries & Constraints

**Always:** Keep Google identities fixed to `User`; preserve Admin precedence for Auth0 Database identities; rename existing role enum values without deleting user rows; keep the literal Supabase third-party claim `role: authenticated`; update both access-token and ID-token namespaced claims; document the Auth0 dashboard migration order; preserve all current unrelated working-tree changes.

**Ask First:** Stop if the live `public.users.role` type is not `public.app_role`, if its current values are not `CUSTOMER`/`ADMIN` (or already `USER`/`ADMIN`), or if Auth0 has permissions attached directly to the old Customer role that cannot be transferred safely.

**Never:** Rename business-domain customer concepts such as `customers`, `customer_id`, customer order/profile descriptions, `/admin/customers`, UI labels meaning “khách hàng”, or mock customer data; alter Admin permissions; support automatic Admin assignment; commit credentials; apply migrations or Auth0 changes remotely; reset `compose.yaml` or `app/auth/error/page.tsx`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Google login | Any Google identity, including one accidentally assigned Admin | Token and Supabase row use `user`/`USER` | Never promote to Admin |
| Database User | Auth0 Database identity assigned role `User` | Token uses `user`; row uses `USER` | Deny if no supported role |
| Database Admin | Auth0 Database identity assigned role `Admin` | Token uses `admin`; row uses `ADMIN` | Preserve existing permission checks |
| Old token | Token contains only `customer` | Backend does not authorize it after cutover | User must log in again for a new token |
| Existing database row | `public.users.role = CUSTOMER` | Migration changes it to `USER` without replacing the row | Stop on unexpected enum/schema |

</frozen-after-approval>

## Code Map

- `auth0/actions/add-token-claims.js` -- tenant-side role allowlist and Google default.
- `lib/auth/jwt.ts`, `lib/auth/authorize.test.ts` -- verified API role type and policy tests.
- `lib/auth0.ts`, `lib/supabase.ts` -- callback role mapping and database enum serialization.
- `supabase/migrations/001_create_enums.sql` -- fresh-schema lowercase `user_role` definition.
- `supabase/migrations/008_rename_customer_role_to_user.sql` -- existing managed-schema enum migration.
- `api-contract/openapi.yaml` -- authoritative API authorization metadata.
- `README.md`, `docs/auth0-supabase.md`, `docs/member-setup.md` -- setup and cutover instructions.

## Tasks & Acceptance

**Execution:**
- [x] `auth0/actions/add-token-claims.js` and tests -- accept `User`/`Admin`, force Google to `user`, and reject the legacy Customer role.
- [x] `lib/auth/jwt.ts`, authorization tests, and Auth0 callback tests -- replace the application role union and every authorization policy fixture with `user`/`admin`.
- [x] `lib/supabase.ts` and tests -- serialize the role enum as `USER`/`ADMIN`.
- [x] `supabase/migrations/001_create_enums.sql` and new migration `008` -- use `user` for fresh `user_role` schemas and safely rename existing `customer`/`CUSTOMER` enum values.
- [x] `api-contract/openapi.yaml`, generated bundle/review copies -- change only authorization-role metadata, leaving customer business terminology intact.
- [x] `README.md`, `docs/auth0-supabase.md`, `docs/member-setup.md`, and database docs -- document the new contract and dashboard/database cutover sequence.

**Acceptance Criteria:**
- Given any new Google login, when the Action and callback run, then the token contains `user` and the same subject is upserted with role `USER`.
- Given a Database account with Auth0 role User or Admin, when its token is verified, then the backend authorizes the corresponding `user` or `admin` policy without accepting legacy `customer`.
- Given an existing `CUSTOMER`/`customer` enum value, when migration 008 runs, then it becomes `USER`/`user` without deleting or recreating dependent rows.
- Given the complete repository, when verification runs, then no authorization-role reference uses Customer casing while business customer terminology remains unchanged.

## Spec Change Log

## Design Notes

The deployment order is numbered database migrations 007 then 008, Auth0 role assignment/permission transfer, Action deployment, then forced re-login so stale Customer tokens expire from active use. Migration 007 safely prepares the live uppercase `app_role`; migration 008 validates or completes either supported role schema.

## Verification

**Commands:**
- `npm test` -- Auth0 Action, callback, JWT, and Supabase role tests pass.
- `npm run check:openapi` -- authorization metadata remains valid.
- `npm run verify` -- all repository gates and production build pass.
- `git diff --check` -- patch is clean.
- targeted `rg` role scan -- no legacy authorization-role references remain outside migration compatibility SQL.

**Manual checks:**
- Apply migrations 007 then 008, update Auth0 roles and deploy the Action, then re-login as Database User, Database Admin, and Google; verify `USER`, `ADMIN`, `USER` in `public.users`.

## Suggested Review Order

**Identity contract**

- Resolve Auth0 identities once, enforcing Google User and Database-role validation.
  [`auth0.ts:33`](../lib/auth0.ts#L33)

- Emit normalized User/Admin claims while preserving Supabase's authenticated ID-token claim.
  [`add-token-claims.js:7`](../auth0/actions/add-token-claims.js#L7)

- Restrict backend authorization to the new user/admin role union.
  [`jwt.ts:12`](../lib/auth/jwt.ts#L12)

**Database synchronization and migration**

- Serialize application roles to managed Supabase USER/ADMIN values during upsert.
  [`supabase.ts:46`](../lib/supabase.ts#L46)

- Preflight legacy data, rename CUSTOMER safely, and enforce identity uniqueness.
  [`007_auth0_users_identity.sql:1`](../supabase/migrations/007_auth0_users_identity.sql#L1)

- Complete idempotent cutover for either supported schema shape.
  [`008_rename_customer_role_to_user.sql:1`](../supabase/migrations/008_rename_customer_role_to_user.sql#L1)

**Contracts and operator guidance**

- Declare user/admin roles as the authoritative API security contract.
  [`openapi.yaml:155`](../api-contract/openapi.yaml#L155)

- Document the executable migration and Auth0 dashboard rollout sequence.
  [`auth0-supabase.md:43`](auth0-supabase.md#L43)

**Regression coverage**

- Cover Google coercion, malformed claims, legacy Customer rejection, and callback failures.
  [`auth0.test.ts:75`](../lib/auth0.test.ts#L75)

- Cover enum serialization and asynchronous Supabase failures.
  [`supabase.test.ts:16`](../lib/supabase.test.ts#L16)
