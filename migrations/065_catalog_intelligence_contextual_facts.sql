begin;

-- Preserve the context that makes compound official specifications true.
-- One raw observation may yield several candidates, for example Kinet's
-- standard charging time and its separate 1000 W charging time.

alter table public.catalog_spec_definitions
  drop constraint catalog_spec_definitions_unit_dimension_check;

alter table public.catalog_spec_definitions
  add constraint catalog_spec_definitions_unit_dimension_check
  check (unit_dimension is null or unit_dimension in (
    'DISTANCE', 'LENGTH', 'SPEED', 'POWER', 'ENERGY', 'TORQUE',
    'TIME', 'COUNT', 'MASS', 'VOLUME'
  ));

alter table public.catalog_spec_aliases
  add column implicit_unit varchar(30),
  add column qualifiers jsonb not null default '[]'::jsonb,
  add constraint catalog_spec_aliases_qualifiers_check
    check (jsonb_typeof(qualifiers) = 'array');

alter table public.catalog_spec_observations
  drop constraint catalog_spec_observations_status_check;

alter table public.catalog_spec_observations
  add column ignored_reason_code varchar(80),
  add column resolution_reason text,
  add constraint catalog_spec_observations_status_check
    check (resolution_status in (
      'RESOLVED', 'UNKNOWN_SPEC', 'AMBIGUOUS', 'INVALID_VALUE',
      'IGNORED', 'SOURCE_CONFLICT'
    ));

create table public.catalog_spec_observation_candidates (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null
    references public.catalog_spec_observations(id) on delete cascade,
  spec_definition_id uuid not null
    references public.catalog_spec_definitions(id) on delete restrict,
  ordinal integer not null,
  display_value text not null,
  numeric_value numeric,
  numeric_upper_value numeric,
  numeric_tolerance numeric,
  text_value text,
  boolean_value boolean,
  duration_seconds numeric,
  canonical_unit varchar(30),
  comparison_operator varchar(10) not null default 'EQ',
  qualifiers jsonb not null default '[]'::jsonb,
  context_key text not null default 'default',
  created_at timestamptz not null default clock_timestamp(),
  constraint catalog_spec_candidate_ordinal_check check (ordinal >= 0),
  constraint catalog_spec_candidate_operator_check
    check (comparison_operator in ('EQ', 'APPROX', 'LT', 'LTE', 'GT', 'GTE', 'RANGE')),
  constraint catalog_spec_candidate_qualifiers_check
    check (jsonb_typeof(qualifiers) = 'array'),
  constraint catalog_spec_candidate_duration_check
    check (duration_seconds is null or duration_seconds >= 0),
  constraint catalog_spec_candidate_tolerance_check
    check (numeric_tolerance is null or numeric_tolerance >= 0),
  constraint catalog_spec_candidate_range_check
    check (
      (comparison_operator <> 'RANGE' and numeric_upper_value is null)
      or (comparison_operator = 'RANGE' and numeric_value is not null and numeric_upper_value >= numeric_value)
    ),
  constraint catalog_spec_candidate_single_value_check
    check (num_nonnulls(numeric_value, text_value, boolean_value, duration_seconds) = 1),
  unique (observation_id, ordinal),
  unique (observation_id, spec_definition_id, context_key)
);

create index catalog_spec_candidate_definition_idx
  on public.catalog_spec_observation_candidates(spec_definition_id, numeric_value);

create table public.catalog_source_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  source_hash varchar(64) not null,
  disposition varchar(30) not null,
  reason text not null,
  evidence_urls jsonb not null default '[]'::jsonb,
  reviewed_by text,
  reviewed_at timestamptz not null default clock_timestamp(),
  superseded_at timestamptz,
  constraint catalog_source_reviews_hash_check
    check (source_hash ~ '^[a-f0-9]{64}$'),
  constraint catalog_source_reviews_disposition_check
    check (disposition in ('VERIFIED', 'OFFICIAL_SOURCE_CONFLICT', 'NO_CURRENT_OFFICIAL_SOURCE')),
  constraint catalog_source_reviews_evidence_check
    check (jsonb_typeof(evidence_urls) = 'array'),
  unique (product_id, source_hash)
);

create index catalog_source_reviews_open_idx
  on public.catalog_source_reviews(product_id, reviewed_at desc)
  where superseded_at is null;

alter table public.product_spec_facts
  add column selected_candidate_id uuid
    references public.catalog_spec_observation_candidates(id) on delete restrict,
  add column numeric_upper_value numeric,
  add column numeric_tolerance numeric,
  add column comparison_operator varchar(10) not null default 'EQ',
  add column qualifiers jsonb not null default '[]'::jsonb,
  add column context_key text not null default 'default',
  add constraint product_spec_facts_operator_check
    check (comparison_operator in ('EQ', 'APPROX', 'LT', 'LTE', 'GT', 'GTE', 'RANGE')),
  add constraint product_spec_facts_qualifiers_check
    check (jsonb_typeof(qualifiers) = 'array'),
  add constraint product_spec_facts_tolerance_check
    check (numeric_tolerance is null or numeric_tolerance >= 0),
  add constraint product_spec_facts_range_check
    check (
      (comparison_operator <> 'RANGE' and numeric_upper_value is null)
      or (comparison_operator = 'RANGE' and numeric_value is not null and numeric_upper_value >= numeric_value)
    );

drop index public.product_spec_fact_product_uq;
drop index public.product_spec_fact_variant_uq;

create unique index product_spec_fact_product_context_uq
  on public.product_spec_facts(product_id, spec_definition_id, context_key)
  where product_variant_id is null;

create unique index product_spec_fact_variant_context_uq
  on public.product_spec_facts(product_id, product_variant_id, spec_definition_id, context_key)
  where product_variant_id is not null;

alter table public.catalog_intelligence_events
  drop constraint catalog_intelligence_events_type_check;

alter table public.catalog_intelligence_events
  add constraint catalog_intelligence_events_type_check
    check (event_type in (
      'NEW_FACT', 'VALUE_CHANGED', 'NEW_SPEC_TYPE', 'CONFLICT',
      'INVALID_VALUE', 'SOURCE_CONFLICT'
    ));

insert into public.catalog_spec_definitions
  (canonical_key, label_vi, label_en, value_type, unit_dimension, canonical_unit, is_sortable, is_searchable, ranking_aggregation)
values
  ('rated_power_kw', 'Công suất danh định', 'Rated power', 'NUMBER', 'POWER', 'kW', true, true, 'MAX'),
  ('wheelbase_mm', 'Chiều dài cơ sở', 'Wheelbase', 'NUMBER', 'LENGTH', 'mm', true, true, 'MAX'),
  ('ground_clearance_mm', 'Khoảng sáng gầm', 'Ground clearance', 'NUMBER', 'LENGTH', 'mm', true, true, 'MAX'),
  ('seat_height_mm', 'Chiều cao yên', 'Seat height', 'NUMBER', 'LENGTH', 'mm', true, true, 'MIN'),
  ('tire_spec', 'Kích thước lốp trước/sau', 'Tire specification', 'TEXT', null, null, false, true, null),
  ('suspension_system', 'Hệ thống giảm xóc', 'Suspension system', 'TEXT', null, null, false, true, null),
  ('lock_type', 'Loại khóa', 'Lock type', 'TEXT', null, null, false, true, null),
  ('battery_type', 'Loại pin/ắc quy', 'Battery type', 'TEXT', null, null, false, true, null),
  ('charger_type', 'Loại sạc', 'Charger type', 'TEXT', null, null, false, true, null),
  ('trunk_volume_l', 'Thể tích cốp', 'Trunk volume', 'NUMBER', 'VOLUME', 'L', true, true, 'MAX'),
  ('motor_ip_rating', 'Tiêu chuẩn chống nước động cơ', 'Motor ingress protection', 'TEXT', null, null, false, true, null),
  ('battery_weight_kg', 'Trọng lượng pin/ắc quy', 'Battery weight', 'NUMBER', 'MASS', 'kg', true, true, 'MIN'),
  ('battery_location', 'Vị trí lắp pin', 'Battery location', 'TEXT', null, null, false, true, null),
  ('acceleration_time', 'Thời gian tăng tốc', 'Acceleration time', 'DURATION', 'TIME', 'second', true, true, 'MIN'),
  ('climbing_speed_kmh', 'Tốc độ leo dốc', 'Climbing speed', 'NUMBER', 'SPEED', 'km/h', true, true, 'MAX'),
  ('brake_system', 'Hệ thống phanh', 'Brake system', 'TEXT', null, null, false, true, null),
  ('payload_kg', 'Tải trọng', 'Payload', 'NUMBER', 'MASS', 'kg', true, true, 'MAX'),
  ('vehicle_weight_kg', 'Trọng lượng xe', 'Vehicle weight', 'NUMBER', 'MASS', 'kg', true, true, 'MIN'),
  ('headlight_system', 'Đèn chiếu sáng phía trước', 'Headlight system', 'TEXT', null, null, false, true, null),
  ('infotainment_display', 'Màn hình thông tin/giải trí', 'Infotainment display', 'TEXT', null, null, false, true, null),
  ('dc_charging_power_kw', 'Công suất sạc nhanh DC tối đa', 'Maximum DC charging power', 'NUMBER', 'POWER', 'kW', true, true, 'MAX'),
  ('abs', 'Chống bó cứng phanh ABS', 'ABS', 'BOOLEAN', null, null, false, true, null),
  ('air_conditioner', 'Điều hòa', 'Air conditioner', 'TEXT', null, null, false, true, null),
  ('driver_seat_adjustment', 'Điều chỉnh ghế lái', 'Driver seat adjustment', 'TEXT', null, null, false, true, null),
  ('wheel_spec', 'Thông số la-zăng', 'Wheel specification', 'TEXT', null, null, false, true, null),
  ('ebd', 'Phân phối lực phanh điện tử EBD', 'EBD', 'BOOLEAN', null, null, false, true, null),
  ('airbag_count', 'Số túi khí', 'Airbag count', 'NUMBER', 'COUNT', 'airbag', true, true, 'MAX'),
  ('curb_weight_payload', 'Khối lượng không tải / tải trọng', 'Curb weight / payload', 'TEXT', null, 'kg', false, true, null),
  ('audio_system', 'Hệ thống âm thanh', 'Audio system', 'TEXT', null, null, false, true, null)
on conflict (canonical_key) do update set
  label_vi = excluded.label_vi,
  label_en = excluded.label_en,
  value_type = excluded.value_type,
  unit_dimension = excluded.unit_dimension,
  canonical_unit = excluded.canonical_unit,
  is_sortable = excluded.is_sortable,
  is_searchable = excluded.is_searchable,
  ranking_aggregation = excluded.ranking_aggregation,
  updated_at = clock_timestamp();

with seed(canonical_key, alias, product_type, source_schema, match_kind, implicit_unit, qualifiers) as (
  values
    ('rated_power_kw', 'Công suất danh định', 'MOTORBIKE', '*', 'LABEL', null, '[]'::jsonb),
    ('wheelbase_mm', 'Khoảng cách trục bánh Trước-Sau', 'MOTORBIKE', '*', 'LABEL', null, '[]'::jsonb),
    ('ground_clearance_mm', 'Khoảng sáng gầm', 'MOTORBIKE', '*', 'LABEL', null, '[]'::jsonb),
    ('seat_height_mm', 'Chiều cao yên', 'MOTORBIKE', '*', 'LABEL', null, '[]'::jsonb),
    ('tire_spec', 'Kích thước lốp Trước - Sau', 'MOTORBIKE', '*', 'LABEL', null, '[]'::jsonb),
    ('suspension_system', 'Giảm xóc trước và sau', 'MOTORBIKE', '*', 'LABEL', null, '[]'::jsonb),
    ('lock_type', 'Khóa xe', 'MOTORBIKE', '*', 'LABEL', null, '[]'::jsonb),
    ('battery_type', 'Loại pin/ắc quy', 'MOTORBIKE', '*', 'LABEL', null, '[]'::jsonb),
    ('charger_type', 'Loại sạc', 'MOTORBIKE', '*', 'LABEL', null, '[]'::jsonb),
    ('trunk_volume_l', 'Thể tích cốp', 'MOTORBIKE', '*', 'LABEL', null, '[]'::jsonb),
    ('motor_ip_rating', 'Tiêu chuẩn chống nước động cơ', 'MOTORBIKE', '*', 'LABEL', null, '[]'::jsonb),
    ('battery_weight_kg', 'Trọng lượng pin/ắc quy', 'MOTORBIKE', '*', 'LABEL', 'kg', '[]'::jsonb),
    ('battery_location', 'Vị trí lắp pin', 'MOTORBIKE', '*', 'LABEL', null, '[]'::jsonb),
    ('acceleration_time', 'Gia tốc 0 - 50 km/h', 'MOTORBIKE', '*', 'LABEL', null, '[{"key":"start_speed_kmh","value":0,"unit":"km/h"},{"key":"end_speed_kmh","value":50,"unit":"km/h"}]'::jsonb),
    ('acceleration_time', 'Gia tốc 0 - 40 km/h', 'MOTORBIKE', '*', 'LABEL', null, '[{"key":"start_speed_kmh","value":0,"unit":"km/h"},{"key":"end_speed_kmh","value":40,"unit":"km/h"}]'::jsonb),
    ('climbing_speed_kmh', 'Khả năng leo dốc 20%', 'MOTORBIKE', '*', 'LABEL', null, '[{"key":"grade_percent","value":20,"unit":"%"}]'::jsonb),
    ('brake_system', 'Phanh trước và sau', 'MOTORBIKE', '*', 'LABEL', null, '[]'::jsonb),
    ('payload_kg', 'Tải trọng', 'MOTORBIKE', '*', 'LABEL', null, '[]'::jsonb),
    ('vehicle_weight_kg', 'Trọng lượng xe', 'MOTORBIKE', '*', 'LABEL', null, '[]'::jsonb),
    ('headlight_system', 'Đèn pha trước', 'MOTORBIKE', '*', 'LABEL', null, '[]'::jsonb),
    ('top_speed_kmh', 'Tốc độ tối đa - ECO', 'MOTORBIKE', '*', 'LABEL', null, '[{"key":"drive_mode","value":"ECO"}]'::jsonb),
    ('wheelbase_mm', 'specs.*.specs.dimension.wheelbase', 'CAR', '*', 'PATH', 'mm', '[]'::jsonb),
    ('ground_clearance_mm', 'specs.*.specs.dimension.croundClearance', 'CAR', '*', 'PATH', 'mm', '[]'::jsonb),
    ('ground_clearance_mm', 'specs.*.specs.dimension.groundClearance', 'CAR', '*', 'PATH', 'mm', '[]'::jsonb),
    ('curb_weight_payload', 'specs.*.specs.dimension.kurbWeightPayload', 'CAR', '*', 'PATH', null, '[]'::jsonb),
    ('headlight_system', 'specs.*.specs.exterior.auto', 'CAR', '*', 'PATH', null, '[]'::jsonb),
    ('wheel_spec', 'specs.*.specs.exterior.lazang', 'CAR', '*', 'PATH', null, '[]'::jsonb),
    ('air_conditioner', 'specs.*.specs.interior.airConditioner', 'CAR', '*', 'PATH', null, '[]'::jsonb),
    ('driver_seat_adjustment', 'specs.*.specs.interior.driverSeatAdjustment', 'CAR', '*', 'PATH', null, '[]'::jsonb),
    ('infotainment_display', 'specs.*.specs.interior.informationCenter', 'CAR', '*', 'PATH', null, '[]'::jsonb),
    ('infotainment_display', 'specs.*.specs.interior.infoCenter', 'CAR', '*', 'PATH', null, '[]'::jsonb),
    ('audio_system', 'specs.*.specs.interior.audioSystem', 'CAR', '*', 'PATH', null, '[]'::jsonb),
    ('dc_charging_power_kw', 'specs.*.specs.powertrain.maxDCCharging', 'CAR', '*', 'PATH', 'kw', '[]'::jsonb),
    ('abs', 'specs.*.specs.safety.abs', 'CAR', '*', 'PATH', null, '[]'::jsonb),
    ('ebd', 'specs.*.specs.safety.ebd', 'CAR', '*', 'PATH', null, '[]'::jsonb),
    ('airbag_count', 'specs.*.specs.safety.airbagSystem', 'CAR', '*', 'PATH', 'count', '[]'::jsonb)
)
insert into public.catalog_spec_aliases
  (spec_definition_id, alias, product_type, source_schema, match_kind, implicit_unit, qualifiers)
select definition.id, seed.alias, seed.product_type, seed.source_schema, seed.match_kind, seed.implicit_unit, seed.qualifiers
from seed
join public.catalog_spec_definitions definition
  on definition.canonical_key = seed.canonical_key
on conflict (product_type, source_schema, match_kind, normalized_alias) do update set
  spec_definition_id = excluded.spec_definition_id,
  implicit_unit = excluded.implicit_unit,
  qualifiers = excluded.qualifiers;

update public.catalog_spec_aliases alias
set implicit_unit = case definition.canonical_key
      when 'range_km' then 'km'
      when 'max_power_kw' then case
        when alias.product_type = 'MOTORBIKE' then 'w'
        when alias.product_type = 'CAR' and alias.match_kind = 'LABEL' then 'kw'
        else alias.implicit_unit
      end
      when 'max_torque_nm' then 'nm'
      when 'top_speed_kmh' then 'km/h'
      when 'battery_capacity_kwh' then 'kwh'
      when 'seats' then 'count'
      else alias.implicit_unit
    end,
    qualifiers = case
      when alias.alias = 'Thời gian sạc tiêu chuẩn'
        then '[{"key":"charging_mode","value":"STANDARD"}]'::jsonb
      when alias.alias = 'Tốc độ tối đa - SPORT'
        then '[{"key":"drive_mode","value":"SPORT"}]'::jsonb
      when alias.alias = 'Quãng đường 1 lần sạc (2 pin)'
        then '[{"key":"battery_count","value":2,"unit":"battery"}]'::jsonb
      else alias.qualifiers
    end
from public.catalog_spec_definitions definition
where definition.id = alias.spec_definition_id;

update public.catalog_spec_aliases alias
set implicit_unit = 'hp'
from public.catalog_spec_definitions definition
where definition.id = alias.spec_definition_id
  and definition.canonical_key = 'max_power_kw'
  and alias.product_type = 'CAR'
  and alias.match_kind = 'PATH'
  and alias.alias = 'specs.*.specs.powertrain.maxPower';

update public.catalog_spec_aliases alias
set source_schema = 'fastlane_car_nested_v1'
from public.catalog_spec_definitions definition
where definition.id = alias.spec_definition_id
  and definition.canonical_key = 'max_power_kw'
  and alias.product_type = 'CAR'
  and alias.match_kind = 'PATH'
  and alias.alias = 'specs.*.specs.powertrain.maxPower';

alter table public.catalog_spec_observation_candidates enable row level security;
alter table public.catalog_source_reviews enable row level security;
revoke all on table public.catalog_spec_observation_candidates from public, anon, authenticated;
revoke all on table public.catalog_source_reviews from public, anon, authenticated;
grant select, insert, update, delete on table public.catalog_spec_observation_candidates to service_role;
grant select, insert, update, delete on table public.catalog_source_reviews to service_role;

update public.catalog_runtime_revision
set registry_revision = registry_revision + 1,
    extractor_version = 'catalog-extractor-v2',
    selection_policy_version = 'catalog-selection-v2',
    updated_at = clock_timestamp()
where singleton = true;

commit;

-- Rollback requires deleting v2 candidates/facts first. Do not downgrade while
-- contextual facts exist; restore migration 064 schema from a reviewed backup.
