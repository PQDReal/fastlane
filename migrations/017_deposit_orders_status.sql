-- Convert deposit_orders status enum to text constraint to allow easy extension of car statuses

begin;

-- Create text column with check constraint
alter table public.deposit_orders
  alter column status type text using status::text;

-- Try to drop the enum type if it exists, otherwise ignore
do $$
begin
  drop type if exists public.deposit_status_enum cascade;
exception
  when others then null;
end $$;

-- Add check constraint for deposit_orders statuses
alter table public.deposit_orders
  drop constraint if exists deposit_orders_status_check;

alter table public.deposit_orders
  add constraint deposit_orders_status_check
  check (
    status in (
      -- Car Order Statuses
      'PENDING_DEPOSIT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'PENDING_CONTRACT', 'CONTRACT_SIGNED', 
      'PENDING_PAYMENT', 'PAID', 'PREPARING_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED',
      -- Fallback for legacy just in case
      'PENDING'
    )
  );

commit;
