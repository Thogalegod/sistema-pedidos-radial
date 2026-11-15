-- Interim owner-only financial records. No user/org UUIDs or credentials are embedded.
-- CLI unavailable (registry DNS blocked); filename matches the IURQ migration version.
CREATE TABLE private.rental_financial_owners (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.rental_financial_owners FROM PUBLIC, anon, authenticated;
ALTER TABLE private.rental_financial_owners ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.can_access_rental_financials(p_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM private.rental_financial_owners o
    JOIN public.organization_members m
      ON m.organization_id = o.organization_id AND m.user_id = o.user_id
    WHERE o.organization_id = p_organization_id AND o.user_id = (SELECT auth.uid())
  );
$$;
REVOKE ALL ON FUNCTION public.can_access_rental_financials(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_rental_financials(uuid) TO authenticated;

CREATE FUNCTION public.current_rental_organization()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT CASE WHEN count(*) = 1 THEN (array_agg(o.organization_id))[1] ELSE NULL END
  FROM private.rental_financial_owners o
  JOIN public.organization_members m
    ON m.organization_id = o.organization_id AND m.user_id = o.user_id
  WHERE o.user_id = (SELECT auth.uid());
$$;
REVOKE ALL ON FUNCTION public.current_rental_organization() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_rental_organization() TO authenticated;

-- RESTRICTIVE policies intersect every existing permissive policy, including admin ones.
DO $$
DECLARE t text;
BEGIN
  -- Contracts/items include prices; equipment, inspections and signatures retain their policies.
  FOREACH t IN ARRAY ARRAY['contracts','rental_items','billing_cycles',
    'billing_lines','payments','contract_documents','billing_delivery_events',
    'audit_events','import_batches']
  LOOP
    EXECUTE format('CREATE POLICY rental_owner_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_access_rental_financials(organization_id)) WITH CHECK (public.can_access_rental_financials(organization_id))', t);
  END LOOP;
END;
$$;
CREATE POLICY rental_owner_only ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
USING (bucket_id <> 'contratos-locacoes-docs' OR split_part(name, '/', 3) NOT IN ('boleto', 'payment_proof', 'remittance_nf') OR split_part(name, '/', 1) = public.current_rental_organization()::text)
WITH CHECK (bucket_id <> 'contratos-locacoes-docs' OR split_part(name, '/', 3) NOT IN ('boleto', 'payment_proof', 'remittance_nf') OR split_part(name, '/', 1) = public.current_rental_organization()::text);

ALTER TABLE public.payments ADD COLUMN operation_id uuid;
CREATE UNIQUE INDEX payments_operation_id_unique ON public.payments (organization_id, operation_id)
WHERE operation_id IS NOT NULL;
-- New receipts must go through the transaction below, never a separate INSERT then UPDATE.
REVOKE INSERT ON public.payments FROM authenticated;
REVOKE INSERT (id, organization_id, billing_cycle_id, paid_at, amount, notes, created_at, updated_at, operation_id) ON public.payments FROM authenticated;

CREATE FUNCTION public.record_rental_payment(
  p_organization_id uuid, p_billing_cycle_id uuid, p_operation_id uuid,
  p_paid_at date, p_amount bigint, p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_billing public.billing_cycles%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_paid numeric;
  v_notes text := nullif(btrim(p_notes), '');
  v_payments jsonb;
BEGIN
  IF NOT public.can_access_rental_financials(p_organization_id) THEN
    RAISE EXCEPTION 'financial access required' USING ERRCODE = '42501';
  END IF;
  IF p_operation_id IS NULL OR p_billing_cycle_id IS NULL OR p_paid_at IS NULL
     OR p_amount IS NULL OR p_amount <= 0 OR p_amount > 9007199254740991
     OR length(v_notes) > 4000 THEN
    RAISE EXCEPTION 'invalid payment input' USING ERRCODE = '22023';
  END IF;
  -- Serialize operation keys even when a caller accidentally reuses one on another bill.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text || ':' || p_operation_id::text, 0));
  SELECT * INTO v_billing FROM public.billing_cycles
    WHERE organization_id = p_organization_id AND id = p_billing_cycle_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'billing not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_payment FROM public.payments
    WHERE organization_id = p_organization_id AND operation_id = p_operation_id;
  IF FOUND THEN
    IF v_payment.billing_cycle_id <> p_billing_cycle_id
       OR v_payment.paid_at <> (p_paid_at::timestamp AT TIME ZONE 'America/Sao_Paulo')
       OR v_payment.amount <> p_amount OR v_payment.notes IS DISTINCT FROM v_notes THEN
      RAISE EXCEPTION 'operation key already used with different payment' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF v_billing.status NOT IN ('issued', 'overdue') THEN
      RAISE EXCEPTION 'billing is not collectible' USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(sum(amount), 0) INTO v_paid FROM public.payments
      WHERE organization_id = p_organization_id AND billing_cycle_id = p_billing_cycle_id;
    IF v_paid + p_amount > v_billing.total_amount THEN
      RAISE EXCEPTION 'payment exceeds outstanding balance' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.payments (organization_id, billing_cycle_id, operation_id, paid_at, amount, notes)
    VALUES (p_organization_id, p_billing_cycle_id, p_operation_id,
      p_paid_at::timestamp AT TIME ZONE 'America/Sao_Paulo', p_amount, v_notes)
    RETURNING * INTO v_payment;
    UPDATE public.billing_cycles SET status = CASE
      WHEN v_paid + p_amount >= total_amount THEN 'paid'::public.billing_status
      WHEN due_date < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'overdue'::public.billing_status
      ELSE 'issued'::public.billing_status END
    WHERE organization_id = p_organization_id AND id = p_billing_cycle_id
    RETURNING * INTO v_billing;
    INSERT INTO public.audit_events (organization_id, actor_user_id, entity_type, entity_id, action, new_values)
    VALUES (p_organization_id, auth.uid(), 'payment', v_payment.id, 'payment_recorded',
      jsonb_build_object('billing_cycle_id', p_billing_cycle_id, 'operation_id', p_operation_id, 'amount', p_amount::text));
  END IF;
  SELECT coalesce(sum(amount), 0), coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object('amount',p.amount::text) ORDER BY p.created_at,p.id), '[]'::jsonb)
    INTO v_paid, v_payments FROM public.payments p
    WHERE organization_id = p_organization_id AND billing_cycle_id = p_billing_cycle_id;
  RETURN jsonb_build_object(
    'billing', to_jsonb(v_billing) || jsonb_build_object(
      'base_amount',v_billing.base_amount::text,'discount_amount',v_billing.discount_amount::text,
      'surcharge_amount',v_billing.surcharge_amount::text,'exemption_amount',v_billing.exemption_amount::text,
      'total_amount',v_billing.total_amount::text),
    'payment', to_jsonb(v_payment) || jsonb_build_object('amount',v_payment.amount::text),
    'payments', v_payments,
    'balance', jsonb_build_object('paid_amount',v_paid::text,
      'balance_amount',greatest(0,v_billing.total_amount-v_paid)::text,'is_paid_in_full',v_paid >= v_billing.total_amount));
END;
$$;
REVOKE ALL ON FUNCTION public.record_rental_payment(uuid,uuid,uuid,date,bigint,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_rental_payment(uuid,uuid,uuid,date,bigint,text) TO authenticated;

-- Existing validated flow, with owner check before any SECURITY DEFINER access.
CREATE OR REPLACE FUNCTION public.begin_boleto_change(p_organization_id uuid, p_contract_id uuid, p_billing_cycle_id uuid, p_operation_id uuid)
 RETURNS TABLE(status text, operation_id uuid, started_at timestamp with time zone, content_revision bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_billing public.billing_cycles%ROWTYPE;
BEGIN
  IF NOT public.can_access_rental_financials(p_organization_id) THEN
    RAISE EXCEPTION 'financial access required' USING ERRCODE = '42501';
  END IF;
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'operation id is required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members AS membership
    WHERE membership.organization_id = p_organization_id
      AND membership.user_id = (select auth.uid())
      AND (membership.role = 'admin' OR membership.can_manage_billing = true)
  ) THEN RAISE EXCEPTION 'billing capability required' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_billing
  FROM public.billing_cycles AS billing
  WHERE billing.organization_id = p_organization_id
    AND billing.contract_id = p_contract_id
    AND billing.id = p_billing_cycle_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'billing cycle not found' USING ERRCODE = 'P0002'; END IF;

  IF v_billing.boleto_change_pending THEN
    IF v_billing.boleto_change_operation_id IS DISTINCT FROM p_operation_id THEN
      RAISE EXCEPTION 'another boleto change is pending' USING ERRCODE = '55P03';
    END IF;
    RETURN QUERY SELECT 'pending', p_operation_id, v_billing.boleto_change_started_at, v_billing.content_revision;
    RETURN;
  END IF;

  IF v_billing.boleto_change_operation_id = p_operation_id THEN
    RETURN QUERY SELECT 'already_finished', p_operation_id, NULL::timestamptz, v_billing.content_revision;
    RETURN;
  END IF;

  UPDATE public.billing_cycles AS billing
  SET boleto_change_pending = true,
      boleto_change_operation_id = p_operation_id,
      boleto_change_started_at = clock_timestamp()
  WHERE billing.organization_id = p_organization_id AND billing.id = p_billing_cycle_id
  RETURNING billing.* INTO v_billing;

  RETURN QUERY SELECT 'pending', p_operation_id, v_billing.boleto_change_started_at, v_billing.content_revision;
END;
$function$
;

-- Existing validated flow, with owner check before any SECURITY DEFINER access.
CREATE OR REPLACE FUNCTION public.finalize_billing_delivery(p_organization_id uuid, p_billing_cycle_id uuid, p_sent_at timestamp with time zone, p_recipients text[], p_provider_message_id text, p_send_request_id uuid, p_additional_message text, p_expected_content_revision bigint)
 RETURNS TABLE(event_id uuid, effective_sent_at timestamp with time zone, needs_resend boolean, inserted_event boolean, review_required boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_billing public.billing_cycles%ROWTYPE;
  v_event public.billing_delivery_events%ROWTYPE;
  v_effective_sent_at timestamptz;
  v_needs_resend boolean;
  v_inserted_event boolean;
  v_stable boolean;
BEGIN
  IF NOT public.can_access_rental_financials(p_organization_id) THEN
    RAISE EXCEPTION 'financial access required' USING ERRCODE = '42501';
  END IF;
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
$function$
;

-- Existing validated flow, with owner check before any SECURITY DEFINER access.
CREATE OR REPLACE FUNCTION public.finish_boleto_change(p_organization_id uuid, p_contract_id uuid, p_billing_cycle_id uuid, p_operation_id uuid)
 RETURNS TABLE(document jsonb, billing jsonb, already_finished boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_billing public.billing_cycles%ROWTYPE;
  v_document public.contract_documents%ROWTYPE;
  v_path text;
  v_object_updated_at timestamptz;
  v_object_mimetype text;
BEGIN
  IF NOT public.can_access_rental_financials(p_organization_id) THEN
    RAISE EXCEPTION 'financial access required' USING ERRCODE = '42501';
  END IF;
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members AS membership
    WHERE membership.organization_id = p_organization_id
      AND membership.user_id = (select auth.uid())
      AND (membership.role = 'admin' OR membership.can_manage_billing = true)
  ) THEN RAISE EXCEPTION 'billing capability required' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_billing
  FROM public.billing_cycles AS cycle
  WHERE cycle.organization_id = p_organization_id
    AND cycle.contract_id = p_contract_id
    AND cycle.id = p_billing_cycle_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'billing cycle not found' USING ERRCODE = 'P0002'; END IF;

  IF NOT v_billing.boleto_change_pending
     AND v_billing.boleto_change_operation_id = p_operation_id THEN
    SELECT * INTO v_document FROM public.contract_documents AS existing
    WHERE existing.organization_id = p_organization_id
      AND existing.contract_id = p_contract_id
      AND existing.billing_cycle_id = p_billing_cycle_id
      AND existing.kind = 'boleto';
    IF NOT FOUND THEN RAISE EXCEPTION 'completed boleto document not found' USING ERRCODE = 'P0002'; END IF;
    RETURN QUERY SELECT to_jsonb(v_document), to_jsonb(v_billing), true;
    RETURN;
  END IF;

  IF NOT v_billing.boleto_change_pending
     OR v_billing.boleto_change_operation_id IS DISTINCT FROM p_operation_id THEN
    RAISE EXCEPTION 'boleto operation does not match pending change' USING ERRCODE = '55P03';
  END IF;

  v_path := p_organization_id::text || '/' || p_contract_id::text
    || '/boleto/' || p_billing_cycle_id::text || '.pdf';

  SELECT object.updated_at, object.metadata ->> 'mimetype'
  INTO v_object_updated_at, v_object_mimetype
  FROM storage.objects AS object
  WHERE object.bucket_id = 'contratos-locacoes-docs' AND object.name = v_path
  FOR UPDATE;

  IF NOT FOUND OR v_object_mimetype IS DISTINCT FROM 'application/pdf'
     OR v_object_updated_at < v_billing.boleto_change_started_at THEN
    RAISE EXCEPTION 'confirmed boleto upload not found after begin' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.contract_documents (
    organization_id, contract_id, billing_cycle_id, payment_id, inspection_id,
    kind, storage_path, file_name, content_type, created_by
  ) VALUES (
    p_organization_id, p_contract_id, p_billing_cycle_id, NULL, NULL,
    'boleto', v_path, p_billing_cycle_id::text || '.pdf', 'application/pdf', (select auth.uid())
  )
  ON CONFLICT (organization_id, billing_cycle_id) WHERE kind = 'boleto'
  DO UPDATE SET
    contract_id = EXCLUDED.contract_id,
    payment_id = NULL,
    inspection_id = NULL,
    storage_path = EXCLUDED.storage_path,
    file_name = EXCLUDED.file_name,
    content_type = EXCLUDED.content_type
  RETURNING * INTO v_document;

  UPDATE public.billing_cycles AS cycle
  SET content_revision = cycle.content_revision + 1,
      needs_resend = CASE WHEN cycle.sent_at IS NOT NULL THEN true ELSE cycle.needs_resend END,
      boleto_change_pending = false,
      boleto_change_operation_id = p_operation_id,
      boleto_change_started_at = NULL
  WHERE cycle.organization_id = p_organization_id AND cycle.id = p_billing_cycle_id
  RETURNING cycle.* INTO v_billing;

  RETURN QUERY SELECT to_jsonb(v_document), to_jsonb(v_billing), false;
END;
$function$
;
