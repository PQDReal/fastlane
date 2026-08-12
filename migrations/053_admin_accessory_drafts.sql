-- Persist in-progress accessory product authoring without creating partial catalog rows.
-- The payload is intentionally stored as a JSON snapshot because drafts may be
-- incomplete and still contain temporary client-side IDs.

create table if not exists public.admin_accessory_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null
    references public.users(id) on delete cascade,
  client_key uuid not null,
  product_id uuid
    references public.products(id) on delete set null,
  root_category_id uuid
    references public.categories(id) on delete restrict,
  template_version_id uuid
    references public.accessory_template_versions(id) on delete set null,
  name_snapshot text not null default '',
  payload jsonb not null,
  schema_version integer not null default 1,
  revision bigint not null default 1,
  status text not null default 'DRAFT',
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  last_opened_at timestamptz,
  constraint admin_accessory_drafts_client_key_check
    check (client_key <> '00000000-0000-0000-0000-000000000000'::uuid),
  constraint admin_accessory_drafts_name_snapshot_check
    check (char_length(name_snapshot) <= 200),
  constraint admin_accessory_drafts_payload_check
    check (jsonb_typeof(payload) = 'object'::text),
  constraint admin_accessory_drafts_schema_version_check
    check (schema_version >= 1),
  constraint admin_accessory_drafts_revision_check
    check (revision >= 1),
  constraint admin_accessory_drafts_status_check
    check (status = any (array['DRAFT'::text, 'ARCHIVED'::text]))
);

create unique index if not exists admin_accessory_drafts_owner_client_key_idx
  on public.admin_accessory_drafts(owner_user_id, client_key);

create unique index if not exists admin_accessory_drafts_owner_product_draft_idx
  on public.admin_accessory_drafts(owner_user_id, product_id)
  where product_id is not null and status = 'DRAFT';

create index if not exists admin_accessory_drafts_owner_updated_idx
  on public.admin_accessory_drafts(owner_user_id, status, updated_at desc);

create index if not exists admin_accessory_drafts_product_idx
  on public.admin_accessory_drafts(product_id)
  where product_id is not null;

alter table public.admin_accessory_drafts enable row level security;

revoke all on table public.admin_accessory_drafts from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.admin_accessory_drafts to service_role;

comment on table public.admin_accessory_drafts is
  'Private admin snapshots for incomplete accessory product authoring; never read by the customer catalog.';
comment on column public.admin_accessory_drafts.payload is
  'Versioned AdminAccessoryDraft JSON snapshot. It may contain incomplete fields and temporary client IDs.';
