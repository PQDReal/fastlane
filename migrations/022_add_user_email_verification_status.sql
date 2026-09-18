begin;

alter table public.users
  add column if not exists email_verified boolean not null default false;

comment on column public.users.email_verified is
  'Last known Auth0 email verification status. Updated during login or an explicit admin verification.';

commit;

-- Rollback (review application compatibility before running):
-- alter table public.users drop column if exists email_verified;