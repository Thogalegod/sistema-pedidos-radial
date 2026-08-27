CREATE OR REPLACE FUNCTION public.finalize_billing_delivery(
  p_organization_id uuid,
  p_billing_cycle_id uuid,
  p_sent_at timestamptz,
  p_recipients text[],
  p_provider_message_id text,
  p_send_request_id uuid,
  p_additional_message text,
  p_expected_content_revision bigint
)
RETURNS TABLE (
  event_id uuid,
  effective_sent_at timestamptz,
  needs_resend boolean,
  inserted_event boolean,
  review_required boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_billing public.billing_cycles%ROWTYPE;
  v_event public.billing_delivery_events%ROWTYPE;
  v_effective_sent_at timestamptz;
  v_needs_resend boolean;
  v_inserted_event boolean;
  v_stable boolean;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL
     OR p_billing_cycle_id IS NULL
     OR p_sent_at IS NULL
     OR p_send_request_id IS NULL
     OR p_expected_content_revision IS NULL
     OR p_expected_content_revision < 0
     OR p_provider_message_id IS NULL
     OR btrim(p_provider_message_id) = ''
     OR p_recipients IS NULL
     OR cardinality(p_recipients) NOT BETWEEN 1 AND 50
     OR EXISTS (
       SELECT 1
       FROM unnest(p_recipients) AS recipient(value)
       WHERE recipient.value IS NULL
          OR btrim(recipient.value) = ''
          OR recipient.value IS DISTINCT FROM lower(btrim(recipient.value))
     )
     OR cardinality(p_recipients) IS DISTINCT FROM (
       SELECT count(DISTINCT recipient.value)::integer
       FROM unnest(p_recipients) AS recipient(value)
     )
     OR (p_additional_message IS NOT NULL AND p_additional_message IS DISTINCT FROM btrim(p_additional_message)) THEN
    RAISE EXCEPTION 'invalid billing delivery finalization payload' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.organization_id = p_organization_id
      AND membership.user_id = (select auth.uid())
      AND (membership.role = 'admin' OR membership.can_manage_billing = true)
  ) THEN
    RAISE EXCEPTION 'billing capability required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_billing
  FROM public.billing_cycles AS billing
  WHERE billing.organization_id = p_organization_id
    AND billing.id = p_billing_cycle_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'billing cycle not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.billing_delivery_events (
    organization_id,
    billing_cycle_id,
    sent_at,
    recipients,
    provider_message_id,
    send_request_id,
    additional_message,
    created_by
  ) VALUES (
    p_organization_id,
    p_billing_cycle_id,
    p_sent_at,
    p_recipients,
    p_provider_message_id,
    p_send_request_id,
    p_additional_message,
    (select auth.uid())
  )
  ON CONFLICT (send_request_id) DO NOTHING
  RETURNING * INTO v_event;

  v_inserted_event := FOUND;

  IF v_inserted_event THEN
    v_stable := v_billing.content_revision = p_expected_content_revision
      AND v_billing.boleto_change_pending = false;
  ELSE
    SELECT * INTO v_event
    FROM public.billing_delivery_events AS event
    WHERE event.send_request_id = p_send_request_id;

    IF NOT FOUND
       OR v_event.organization_id IS DISTINCT FROM p_organization_id
       OR v_event.billing_cycle_id IS DISTINCT FROM p_billing_cycle_id
       OR v_event.provider_message_id IS DISTINCT FROM p_provider_message_id
       OR v_event.recipients IS DISTINCT FROM p_recipients
       OR v_event.additional_message IS DISTINCT FROM p_additional_message THEN
      RAISE EXCEPTION 'billing delivery intent conflict' USING ERRCODE = '23505';
    END IF;
  END IF;

  SELECT max(event.sent_at) INTO v_effective_sent_at
  FROM public.billing_delivery_events AS event
  WHERE event.organization_id = p_organization_id
    AND event.billing_cycle_id = p_billing_cycle_id;

  IF v_inserted_event THEN
    UPDATE public.billing_cycles AS billing
    SET sent_at = CASE
          WHEN billing.sent_at IS NULL OR billing.sent_at < v_effective_sent_at
            THEN v_effective_sent_at
          ELSE billing.sent_at
        END,
        needs_resend = CASE
          WHEN billing.content_revision = p_expected_content_revision
           AND billing.boleto_change_pending = false
            THEN false
          ELSE true
        END
    WHERE billing.organization_id = p_organization_id
      AND billing.id = p_billing_cycle_id
    RETURNING billing.sent_at, billing.needs_resend
      INTO v_effective_sent_at, v_needs_resend;
  ELSE
    UPDATE public.billing_cycles AS billing
    SET sent_at = CASE
          WHEN billing.sent_at IS NULL OR billing.sent_at < v_effective_sent_at
            THEN v_effective_sent_at
          ELSE billing.sent_at
        END
    WHERE billing.organization_id = p_organization_id
      AND billing.id = p_billing_cycle_id
    RETURNING billing.sent_at, billing.needs_resend
      INTO v_effective_sent_at, v_needs_resend;
  END IF;

  RETURN QUERY SELECT
    v_event.id,
    v_effective_sent_at,
    v_needs_resend,
    v_inserted_event,
    v_needs_resend;
END;
$$;

ALTER FUNCTION public.finalize_billing_delivery(
  uuid, uuid, timestamptz, text[], text, uuid, text, bigint
) OWNER TO postgres;

REVOKE EXECUTE ON FUNCTION public.finalize_billing_delivery(
  uuid, uuid, timestamptz, text[], text, uuid, text, bigint
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.finalize_billing_delivery(
  uuid, uuid, timestamptz, text[], text, uuid, text, bigint
) TO authenticated;
