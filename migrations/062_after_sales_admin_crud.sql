-- Admin-only RPCs for draft after-sales facts.
-- Direct service-role table writes remain revoked by migration 061.

create or replace function public.admin_after_sales_upsert_fact(p_fact_id text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'admin_after_sales_upsert_fact requires service_role';
  end if;

  insert into public.after_sales_facts (
    fact_id, fact_group_id, canonical_key, primary_source_id, source_ids,
    service_type, vehicle_type, powertrain, model, subject, policy_entity,
    battery_chemistry, usage_condition, applicability, action, fact_type,
    value_numeric, value_text, unit, qualifier, interval_relation,
    interval_group_id, interval_group_distance_policy, distance_policy,
    confidence, source_review_status, review_reasons, publication_status,
    approval_status, release_id, updated_at
  )
  select
    p_fact_id, coalesce(x.fact_group_id, 'admin-' || p_fact_id),
    coalesce(x.canonical_key, 'admin:' || p_fact_id), x.primary_source_id,
    array[x.primary_source_id]::text[], x.service_type, x.vehicle_type,
    coalesce(x.powertrain, 'all'), x.model, x.subject, coalesce(x.policy_entity, x.subject),
    coalesce(x.battery_chemistry, 'not_applicable'), coalesce(x.usage_condition, 'standard_use'),
    coalesce(x.applicability, 'all'), coalesce(x.action, 'inspect'), x.fact_type,
    x.value_numeric, coalesce(x.value_text, ''), x.unit, x.qualifier, x.interval_relation,
    x.interval_group_id, x.interval_group_distance_policy, coalesce(x.distance_policy, 'not_stated'),
    x.confidence, 'admin_draft', array['admin_created_or_edited']::text[], 'review_required',
    'pending', null, now()
  from jsonb_to_record(p_payload) as x(
    fact_group_id text, canonical_key text, primary_source_id text,
    service_type text, vehicle_type text, powertrain text, model text,
    subject text, policy_entity text, battery_chemistry text, usage_condition text,
    applicability text, action text, fact_type text, value_numeric numeric,
    value_text text, unit text, qualifier text, interval_relation text,
    interval_group_id text, interval_group_distance_policy text,
    distance_policy text, confidence numeric
  )
  on conflict (fact_id) do update set
    primary_source_id = excluded.primary_source_id, source_ids = excluded.source_ids,
    service_type = excluded.service_type, vehicle_type = excluded.vehicle_type,
    powertrain = excluded.powertrain, model = excluded.model, subject = excluded.subject,
    policy_entity = excluded.policy_entity, battery_chemistry = excluded.battery_chemistry,
    usage_condition = excluded.usage_condition, applicability = excluded.applicability,
    action = excluded.action, fact_type = excluded.fact_type, value_numeric = excluded.value_numeric,
    value_text = excluded.value_text, unit = excluded.unit, qualifier = excluded.qualifier,
    interval_relation = excluded.interval_relation, interval_group_id = excluded.interval_group_id,
    interval_group_distance_policy = excluded.interval_group_distance_policy,
    distance_policy = excluded.distance_policy, confidence = excluded.confidence,
    source_review_status = 'admin_draft', review_reasons = array['admin_created_or_edited']::text[],
    publication_status = 'review_required', updated_at = now()
  where public.after_sales_facts.approval_status = 'pending'
    and public.after_sales_facts.release_id is null;

  select to_jsonb(f) into v_result from public.after_sales_facts f where f.fact_id = p_fact_id;
  if v_result is null then raise exception 'fact is locked, published, or does not exist'; end if;
  return v_result;
end;
$$;

create or replace function public.admin_after_sales_reject_fact(p_fact_id text, p_reviewer_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_result jsonb;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then raise exception 'admin_after_sales_reject_fact requires service_role'; end if;
  update public.after_sales_facts
  set approval_status = 'rejected', publication_status = 'review_required', reviewer_id = p_reviewer_id,
      reviewed_at = now(), review_reasons = array['admin_deleted']::text[], updated_at = now()
  where fact_id = p_fact_id and approval_status = 'pending' and release_id is null
  returning to_jsonb(after_sales_facts.*) into v_result;
  if v_result is null then raise exception 'fact is locked, published, or does not exist'; end if;
  return v_result;
end;
$$;

revoke all on function public.admin_after_sales_upsert_fact(text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.admin_after_sales_reject_fact(text, text) from public, anon, authenticated, service_role;
grant execute on function public.admin_after_sales_upsert_fact(text, jsonb) to service_role;
grant execute on function public.admin_after_sales_reject_fact(text, text) to service_role;
