begin;

-- Keep the existing admin notification feed compatible with test-drive events.
-- The table is created outside this migration chain in existing deployments.
alter table if exists public.admin_notifications
  drop constraint if exists admin_notifications_notification_type_check;

alter table if exists public.admin_notifications
  add constraint admin_notifications_notification_type_check
  check (notification_type in (
    'ORDER_CREATED',
    'ORDER_PAID',
    'ORDER_CANCELLED',
    'DEPOSIT_CREATED',
    'DEPOSIT_PAID',
    'DEPOSIT_CANCELLED',
    'TEST_DRIVE_CREATED'
  ));

commit;
