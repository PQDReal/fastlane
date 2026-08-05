begin;

create table if not exists public.customer_notifications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.users(id) on delete cascade,
  notification_type text not null check (notification_type = 'ORDER_STATUS_CHANGED'),
  title text not null,
  message text not null,
  order_type text not null check (order_type in ('ACCESSORY', 'DEPOSIT')),
  order_id uuid not null,
  order_number text not null,
  previous_status text,
  current_status text not null,
  action_url text not null,
  read_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);

create unique index if not exists customer_notifications_order_status_unique
  on public.customer_notifications(customer_id, order_type, order_id, current_status);
create index if not exists customer_notifications_customer_created_idx
  on public.customer_notifications(customer_id, created_at desc);
create index if not exists customer_notifications_customer_unread_idx
  on public.customer_notifications(customer_id, created_at desc)
  where read_at is null;

alter table public.customer_notifications enable row level security;
revoke all on table public.customer_notifications from public, anon, authenticated;
grant select, insert, update, delete on table public.customer_notifications to service_role;

create or replace function public.order_status_notification_copy(
  p_order_number text,
  p_status text
) returns table(title text, message text)
language sql
immutable
set search_path = pg_catalog, public
as $$
  select
    case p_status
      when 'PAID' then 'Thanh toán thành công'
      when 'CONFIRMED' then 'Đơn hàng đã được xác nhận'
      when 'READY' then 'Đơn hàng đã sẵn sàng'
      when 'PREPARING_DELIVERY' then 'Đơn hàng đang được chuẩn bị giao'
      when 'DELIVERED' then 'Đơn hàng đã được giao'
      when 'COMPLETED' then 'Đơn hàng đã hoàn tất'
      when 'CANCELLED' then 'Đơn hàng đã bị hủy'
      when 'PENDING_CONTRACT' then 'Hồ sơ đã được duyệt'
      when 'CONTRACT_SIGNED' then 'Hợp đồng đã được ký'
      when 'PENDING_PAYMENT' then 'Đơn hàng đang chờ thanh toán'
      else 'Trạng thái đơn hàng đã thay đổi'
    end,
    case p_status
      when 'PAID' then format('Thanh toán cho đơn %s đã thành công.', p_order_number)
      when 'CONFIRMED' then format('Đơn %s đã được xác nhận.', p_order_number)
      when 'READY' then format('Đơn %s đã sẵn sàng để giao.', p_order_number)
      when 'PREPARING_DELIVERY' then format('Đơn %s đang được chuẩn bị giao.', p_order_number)
      when 'DELIVERED' then format('Đơn %s đã được giao.', p_order_number)
      when 'COMPLETED' then format('Đơn %s đã hoàn tất.', p_order_number)
      when 'CANCELLED' then format('Đơn %s đã bị hủy.', p_order_number)
      when 'PENDING_CONTRACT' then format('Hồ sơ của đơn %s đã được duyệt và đang chờ hợp đồng.', p_order_number)
      when 'CONTRACT_SIGNED' then format('Hợp đồng của đơn %s đã được ký.', p_order_number)
      when 'PENDING_PAYMENT' then format('Đơn %s đang chờ thanh toán.', p_order_number)
      else format('Đơn %s đã chuyển sang trạng thái %s.', p_order_number, p_status)
    end;
$$;

create or replace function public.notify_accessory_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_copy record;
begin
  if old.status is not distinct from new.status then return new; end if;
  select * into v_copy from public.order_status_notification_copy(new.order_number, new.status::text);
  insert into public.customer_notifications (
    customer_id, notification_type, title, message, order_type, order_id,
    order_number, previous_status, current_status, action_url
  ) values (
    new.customer_id, 'ORDER_STATUS_CHANGED', v_copy.title, v_copy.message,
    'ACCESSORY', new.id, new.order_number, old.status::text, new.status::text,
    '/profile?tab=orders'
  ) on conflict (customer_id, order_type, order_id, current_status) do nothing;
  return new;
end;
$$;

create or replace function public.notify_deposit_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_customer_id uuid; v_copy record;
begin
  if old.status is not distinct from new.status then return new; end if;
  v_customer_id := new.customer_id;
  if v_customer_id is null and new.email is not null then
    select id into v_customer_id from public.users
      where lower(email) = lower(new.email) limit 1;
  end if;
  if v_customer_id is null then return new; end if;
  select * into v_copy from public.order_status_notification_copy(new.order_number, new.status::text);
  insert into public.customer_notifications (
    customer_id, notification_type, title, message, order_type, order_id,
    order_number, previous_status, current_status, action_url
  ) values (
    v_customer_id, 'ORDER_STATUS_CHANGED', v_copy.title, v_copy.message,
    'DEPOSIT', new.id, new.order_number, old.status::text, new.status::text,
    '/profile?tab=car-orders'
  ) on conflict (customer_id, order_type, order_id, current_status) do nothing;
  return new;
end;
$$;

drop trigger if exists orders_customer_status_notification on public.orders;
create trigger orders_customer_status_notification
after update of status on public.orders
for each row execute function public.notify_accessory_order_status_change();

drop trigger if exists deposit_orders_customer_status_notification on public.deposit_orders;
create trigger deposit_orders_customer_status_notification
after update of status on public.deposit_orders
for each row execute function public.notify_deposit_order_status_change();

revoke all on function public.order_status_notification_copy(text, text) from public, anon, authenticated;
revoke all on function public.notify_accessory_order_status_change() from public, anon, authenticated;
revoke all on function public.notify_deposit_order_status_change() from public, anon, authenticated;

commit;
