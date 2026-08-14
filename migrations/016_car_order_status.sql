-- Convert order_status enum to text constraint to allow easy extension of car statuses

begin;

-- Create text column with check constraint
alter table public.orders
  alter column status type text using status::text;

-- Try to drop the enum type if it exists, otherwise ignore
do $$
begin
  drop type if exists public.order_status cascade;
exception
  when others then null;
end $$;

-- Add check constraint for both accessory and car order statuses
alter table public.orders
  drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (
    status in (
      -- Accessory Statuses
      'PENDING', 'CONFIRMED', 'PREPARING', 'SHIPPED', 'COMPLETED', 'CANCELLED',
      -- Car Order Statuses
      'PENDING_DEPOSIT', 'PENDING_CONFIRMATION', 'PENDING_CONTRACT', 'CONTRACT_SIGNED', 
      'PENDING_PAYMENT', 'PAID', 'PREPARING_DELIVERY', 'DELIVERED'
    )
  );

commit;
