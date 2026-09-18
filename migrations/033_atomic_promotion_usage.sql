-- Atomically consumes one promotion use. The conditional UPDATE takes a row
-- lock and prevents concurrent requests from exceeding usage_limit.
create or replace function public.consume_promotion_usage_atomic(
  p_promotion_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  consumed boolean := false;
begin
  update public.promotions
     set used_count = used_count + 1,
         updated_at = clock_timestamp()
   where id = p_promotion_id
     and is_active = true
     and (usage_limit is null or used_count < usage_limit)
  returning true into consumed;

  return coalesce(consumed, false);
end;
$$;

revoke all on function public.consume_promotion_usage_atomic(uuid) from public;
grant execute on function public.consume_promotion_usage_atomic(uuid) to service_role;

