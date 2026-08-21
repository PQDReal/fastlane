-- The appointment flow was removed from the application.
-- There was no appointment table or persisted booking record: the deleted
-- endpoint only returned a generated reference and never wrote to Supabase.
--
-- Migration 061's release RPC still has compatibility fields for already
-- published release payloads. They are now always empty, excluded from the
-- public read model, and must not be used for appointment functionality.
comment on column public.after_sales_service_locations.bookable_service_types is
  'Deprecated compatibility column. Appointment flow removed; always empty for new releases.';

comment on column public.after_sales_service_locations.booking_actions is
  'Deprecated compatibility column. Appointment flow removed; always empty for new releases.';
