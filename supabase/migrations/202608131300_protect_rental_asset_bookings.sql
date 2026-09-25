-- Lote 3C - Transactional protection against double-booking physical rental assets.
-- Local migration only. Do not apply to IURQ or MISFY from this task.

CREATE OR REPLACE FUNCTION public.assert_rental_asset_booking_available(
  p_organization_id uuid,
  p_asset_id uuid,
  p_contract_id uuid,
  p_rental_item_id uuid,
  p_item_status public.rental_item_status,
  p_returned_at date,
  p_contract_start_date date DEFAULT NULL,
  p_contract_end_date date DEFAULT NULL,
  p_contract_status public.contract_status DEFAULT NULL,
  p_contract_kind public.contract_kind DEFAULT NULL,
  p_use_contract_override boolean DEFAULT false,
  p_require_active boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  asset_status text;
  candidate_contract public.contracts%ROWTYPE;
  candidate_start date;
  candidate_contract_end date;
  candidate_status public.contract_status;
  candidate_kind public.contract_kind;
  candidate_occupancy_end date;
  conflicting_item_id uuid;
BEGIN
  IF p_asset_id IS NULL THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL OR NOT public.is_organization_member(p_organization_id) THEN
    RAISE EXCEPTION 'Usuário autenticado não pertence à organização da locação.'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO candidate_contract
  FROM public.contracts AS contract
  WHERE contract.organization_id = p_organization_id
    AND contract.id = p_contract_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato não encontrado para validar o ativo físico.'
      USING ERRCODE = '23503';
  END IF;

  IF p_use_contract_override THEN
    candidate_start := p_contract_start_date;
    candidate_contract_end := p_contract_end_date;
    candidate_status := p_contract_status;
    candidate_kind := p_contract_kind;
  ELSE
    candidate_start := candidate_contract.start_date;
    candidate_contract_end := candidate_contract.end_date;
    candidate_status := candidate_contract.status;
    candidate_kind := candidate_contract.kind;
  END IF;

  IF candidate_kind IS DISTINCT FROM 'rental' THEN
    RETURN;
  END IF;

  IF candidate_status = 'cancelled' THEN
    RETURN;
  END IF;

  SELECT asset.operational_status
    INTO asset_status
  FROM public.rental_assets AS asset
  WHERE asset.organization_id = p_organization_id
    AND asset.id = p_asset_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ativo físico não encontrado na organização da locação.'
      USING ERRCODE = '23503';
  END IF;

  IF p_require_active AND asset_status <> 'active' THEN
    RAISE EXCEPTION 'Ativo físico não está operacionalmente disponível para locação.'
      USING ERRCODE = '23514';
  END IF;

  IF p_returned_at IS NOT NULL THEN
    candidate_occupancy_end := p_returned_at;
  ELSIF candidate_status = 'closed' THEN
    candidate_occupancy_end := candidate_contract_end;
  ELSIF p_item_status IN ('rented', 'lost_damaged', 'suspended_exempt') THEN
    candidate_occupancy_end := CASE
      WHEN candidate_status = 'awaiting_return' THEN NULL
      ELSE candidate_contract_end
    END;
  ELSE
    RETURN;
  END IF;

  SELECT other_item.id
    INTO conflicting_item_id
  FROM public.rental_items AS other_item
  JOIN public.contracts AS other_contract
    ON other_contract.organization_id = other_item.organization_id
   AND other_contract.id = other_item.contract_id
  WHERE other_item.organization_id = p_organization_id
    AND other_item.asset_id = p_asset_id
    AND other_item.id <> p_rental_item_id
    AND other_contract.kind = 'rental'
    AND other_contract.status <> 'cancelled'
    AND (
      other_item.returned_at IS NOT NULL
      OR other_contract.status = 'closed'
      OR (
        other_item.status IN ('rented', 'lost_damaged', 'suspended_exempt')
        AND other_contract.status IN ('active', 'paused', 'closing_requested', 'awaiting_return', 'inspection')
      )
    )
    AND candidate_start <= COALESCE(
      CASE
        WHEN other_item.returned_at IS NOT NULL THEN other_item.returned_at
        WHEN other_contract.status = 'closed' THEN other_contract.end_date
        WHEN other_contract.status = 'awaiting_return' THEN NULL
        ELSE other_contract.end_date
      END,
      DATE '9999-12-31'
    )
    AND other_contract.start_date <= COALESCE(candidate_occupancy_end, DATE '9999-12-31')
  LIMIT 1;

  IF conflicting_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'Ativo físico indisponível para o período informado.'
      USING ERRCODE = '23P01';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_rental_asset_booking_item_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  requires_active_asset boolean;
  old_item_occupies boolean;
  new_item_occupies boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    requires_active_asset := NEW.asset_id IS NOT NULL;
  ELSE
    old_item_occupies := OLD.asset_id IS NOT NULL
      AND OLD.returned_at IS NULL
      AND OLD.status IN ('rented', 'lost_damaged', 'suspended_exempt');
    new_item_occupies := NEW.asset_id IS NOT NULL
      AND NEW.returned_at IS NULL
      AND NEW.status IN ('rented', 'lost_damaged', 'suspended_exempt');

    requires_active_asset := NEW.asset_id IS NOT NULL
      AND (
        OLD.asset_id IS DISTINCT FROM NEW.asset_id
        OR OLD.contract_id IS DISTINCT FROM NEW.contract_id
        OR OLD.organization_id IS DISTINCT FROM NEW.organization_id
        OR (
          NOT old_item_occupies
          AND new_item_occupies
        )
      );
  END IF;

  PERFORM public.assert_rental_asset_booking_available(
    p_organization_id => NEW.organization_id,
    p_asset_id => NEW.asset_id,
    p_contract_id => NEW.contract_id,
    p_rental_item_id => NEW.id,
    p_item_status => NEW.status,
    p_returned_at => NEW.returned_at,
    p_require_active => requires_active_asset
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_rental_asset_booking_contract_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  linked_item record;
  old_contract_booking_blocks boolean;
  new_contract_booking_blocks boolean;
BEGIN
  IF NEW.kind <> 'rental' THEN
    RETURN NEW;
  END IF;

  FOR linked_item IN
    SELECT item.id, item.asset_id, item.status, item.returned_at
    FROM public.rental_items AS item
    WHERE item.organization_id = NEW.organization_id
      AND item.contract_id = NEW.id
      AND item.asset_id IS NOT NULL
    ORDER BY item.asset_id, item.id
  LOOP
    old_contract_booking_blocks := OLD.kind = 'rental'
      AND OLD.status <> 'cancelled'
      AND (
        linked_item.returned_at IS NOT NULL
        OR OLD.status = 'closed'
        OR (
          linked_item.status IN ('rented', 'lost_damaged', 'suspended_exempt')
          AND OLD.status IN ('active', 'paused', 'closing_requested', 'awaiting_return', 'inspection')
        )
      );
    new_contract_booking_blocks := NEW.kind = 'rental'
      AND NEW.status <> 'cancelled'
      AND (
        linked_item.returned_at IS NOT NULL
        OR NEW.status = 'closed'
        OR (
          linked_item.status IN ('rented', 'lost_damaged', 'suspended_exempt')
          AND NEW.status IN ('active', 'paused', 'closing_requested', 'awaiting_return', 'inspection')
        )
      );

    PERFORM public.assert_rental_asset_booking_available(
      p_organization_id => NEW.organization_id,
      p_asset_id => linked_item.asset_id,
      p_contract_id => NEW.id,
      p_rental_item_id => linked_item.id,
      p_item_status => linked_item.status,
      p_returned_at => linked_item.returned_at,
      p_contract_start_date => NEW.start_date,
      p_contract_end_date => NEW.end_date,
      p_contract_status => NEW.status,
      p_contract_kind => NEW.kind,
      p_use_contract_override => true,
      p_require_active => (
        NOT old_contract_booking_blocks
        AND new_contract_booking_blocks
      )
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS rental_items_asset_booking_guard_trig ON public.rental_items;
CREATE TRIGGER rental_items_asset_booking_guard_trig
  BEFORE INSERT OR UPDATE OF asset_id, status, returned_at, contract_id, organization_id
  ON public.rental_items
  FOR EACH ROW
  EXECUTE FUNCTION public.check_rental_asset_booking_item_trigger();

DROP TRIGGER IF EXISTS contracts_asset_booking_guard_trig ON public.contracts;
CREATE TRIGGER contracts_asset_booking_guard_trig
  BEFORE UPDATE OF start_date, end_date, status, organization_id, kind
  ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.check_rental_asset_booking_contract_trigger();

REVOKE ALL ON FUNCTION public.assert_rental_asset_booking_available(
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
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_rental_asset_booking_item_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_rental_asset_booking_contract_trigger() FROM PUBLIC;
