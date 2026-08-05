begin;

alter table public.deposit_orders
  add column if not exists kyc_status text,
  add column if not exists kyc_session_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'deposit_orders_kyc_status_check'
      and conrelid = 'public.deposit_orders'::regclass
  ) then
    alter table public.deposit_orders
      add constraint deposit_orders_kyc_status_check
      check (
        kyc_status is null
        or kyc_status in ('PENDING', 'REVIEW', 'APPROVED', 'DECLINED')
      );
  end if;
end
$$;

create unique index if not exists deposit_orders_kyc_session_id_key
  on public.deposit_orders (kyc_session_id)
  where kyc_session_id is not null;

comment on column public.deposit_orders.kyc_status is
  'Snapshot of the latest Didit verification state: PENDING, REVIEW, APPROVED, or DECLINED.';
comment on column public.deposit_orders.kyc_session_id is
  'Didit verification session associated with this deposit order.';

commit;
