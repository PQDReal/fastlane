-- Align the orders JSON snapshot constraint with the public ShippingAddress
-- contract used by checkout validation, OpenAPI, and order reads.

begin;

alter table public.orders
  drop constraint if exists orders_shipping_address_required_fields;

alter table public.orders
  add constraint orders_shipping_address_required_fields
  check (
    jsonb_typeof(shipping_address) = 'object'
    and btrim(coalesce(shipping_address ->> 'recipientName', '')) <> ''
    and char_length(shipping_address ->> 'recipientName') <= 120
    and coalesce(shipping_address ->> 'phoneNumber', '') ~ '^\+?[0-9]{9,15}$'
    and btrim(coalesce(shipping_address ->> 'line1', '')) <> ''
    and char_length(shipping_address ->> 'line1') <= 255
    and jsonb_typeof(shipping_address -> 'communeLevel') = 'object'
    and btrim(coalesce(shipping_address #>> '{communeLevel,name}', '')) <> ''
    and char_length(shipping_address #>> '{communeLevel,name}') <= 120
    and shipping_address #>> '{communeLevel,type}' in ('COMMUNE', 'WARD', 'SPECIAL_ZONE')
    and jsonb_typeof(shipping_address -> 'province') = 'object'
    and btrim(coalesce(shipping_address #>> '{province,name}', '')) <> ''
    and char_length(shipping_address #>> '{province,name}') <= 120
    and shipping_address ->> 'countryCode' = 'VN'
  );

commit;

-- Rollback (restores the legacy flat-address constraint):
-- alter table public.orders
--   drop constraint if exists orders_shipping_address_required_fields;
-- alter table public.orders
--   add constraint orders_shipping_address_required_fields
--   check (
--     btrim(coalesce(shipping_address ->> 'recipientName', '')) <> ''
--     and btrim(coalesce(shipping_address ->> 'recipientPhone', '')) <> ''
--     and btrim(coalesce(shipping_address ->> 'addressLine1', '')) <> ''
--     and btrim(coalesce(shipping_address ->> 'province', '')) <> ''
--   );
