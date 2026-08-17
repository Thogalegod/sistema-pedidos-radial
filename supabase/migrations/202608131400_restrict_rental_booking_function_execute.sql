-- Lote 3C - Restrict direct EXECUTE on internal rental booking guard functions.
-- These functions are invoked by triggers/helpers only and must not be callable as RPC.

REVOKE EXECUTE ON FUNCTION public.assert_rental_asset_booking_available(
  uuid,
  uuid,
  uuid,
  uuid,
  public.rental_item_status,
  date,
  date,
  date,
  public.contract_status,
  public.contract_kind,
  boolean,
  boolean
) FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.check_rental_asset_booking_item_trigger()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.check_rental_asset_booking_contract_trigger()
  FROM PUBLIC, anon, authenticated, service_role;
