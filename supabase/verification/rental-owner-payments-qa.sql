-- IURQ only. All synthetic records and changes are rolled back.
BEGIN;
DO $$
DECLARE
  v_org uuid; v_owner uuid; v_other uuid; v_contract uuid;
  v_bill uuid := gen_random_uuid(); v_key uuid := gen_random_uuid();
  v_first jsonb; v_retry jsonb; v_result jsonb; v_count integer;
BEGIN
  SELECT organization_id,user_id INTO STRICT v_org,v_owner FROM private.rental_financial_owners;
  SELECT id INTO v_contract FROM public.contracts WHERE organization_id=v_org LIMIT 1;
  IF v_contract IS NULL THEN RAISE EXCEPTION 'QA needs existing contract'; END IF;
  INSERT INTO public.billing_cycles
    (id,organization_id,contract_id,sequence_number,period_start,period_end,issue_date,due_date,
     base_amount,discount_amount,surcharge_amount,exemption_amount,total_amount,document_type,status)
  SELECT v_bill,v_org,v_contract,coalesce(max(sequence_number),0)+1,
    current_date,current_date+29,current_date,current_date+7,10000,0,0,0,10000,'receipt','issued'
  FROM public.billing_cycles WHERE organization_id=v_org AND contract_id=v_contract;
  SELECT user_id INTO STRICT v_other FROM public.organization_members
    WHERE organization_id=v_org AND user_id <> v_owner AND role='admin' LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub',v_owner::text,true);
  SET LOCAL ROLE authenticated;
  IF NOT public.can_access_rental_financials(v_org) OR public.current_rental_organization() <> v_org THEN
    RAISE EXCEPTION 'owner denied';
  END IF;
  v_first := public.record_rental_payment(v_org,v_bill,v_key,current_date,4000,'QA temporary');
  v_retry := public.record_rental_payment(v_org,v_bill,v_key,current_date,4000,'QA temporary');
  IF v_first->'payment'->>'id' <> v_retry->'payment'->>'id'
     OR v_retry->'balance'->>'balance_amount' <> '6000'
     OR v_retry->'billing'->>'status' <> 'issued' THEN RAISE EXCEPTION 'partial/retry failed'; END IF;
  SELECT count(*) INTO v_count FROM public.payments WHERE billing_cycle_id=v_bill;
  IF v_count <> 1 THEN RAISE EXCEPTION 'duplicate payment'; END IF;
  SELECT count(*) INTO v_count FROM public.audit_events WHERE entity_id=(v_first->'payment'->>'id')::uuid;
  IF v_count <> 1 THEN RAISE EXCEPTION 'duplicate audit'; END IF;
  BEGIN
    PERFORM public.record_rental_payment(v_org,v_bill,v_key,current_date,3999,'QA temporary');
    RAISE EXCEPTION 'key conflict was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN
    PERFORM public.record_rental_payment(v_org,v_bill,gen_random_uuid(),current_date,6001,NULL);
    RAISE EXCEPTION 'overpayment accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN
    INSERT INTO public.payments(organization_id,billing_cycle_id,paid_at,amount) VALUES(v_org,v_bill,now(),1);
    RAISE EXCEPTION 'direct insert accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  v_result := public.record_rental_payment(v_org,v_bill,gen_random_uuid(),current_date,6000,NULL);
  IF v_result->'billing'->>'status' <> 'paid' OR v_result->'balance'->>'balance_amount' <> '0' THEN
    RAISE EXCEPTION 'settlement failed';
  END IF;
  -- Retrying the earlier operation remains safe even after the bill is fully paid.
  v_retry := public.record_rental_payment(v_org,v_bill,v_key,current_date,4000,'QA temporary');
  IF v_retry->'payment'->>'id' <> v_first->'payment'->>'id' THEN RAISE EXCEPTION 'paid retry failed'; END IF;
  PERFORM set_config('request.jwt.claim.sub',v_other::text,true);
  IF public.can_access_rental_financials(v_org) OR public.current_rental_organization() IS NOT NULL THEN
    RAISE EXCEPTION 'admin bypass'; END IF;
  IF EXISTS(SELECT 1 FROM public.billing_cycles WHERE organization_id=v_org)
    OR EXISTS(SELECT 1 FROM public.payments WHERE organization_id=v_org)
    OR EXISTS(SELECT 1 FROM public.contracts WHERE organization_id=v_org)
    OR EXISTS(SELECT 1 FROM public.audit_events WHERE organization_id=v_org)
    OR EXISTS(SELECT 1 FROM public.contract_documents WHERE organization_id=v_org) THEN
    RAISE EXCEPTION 'financial read leak'; END IF;
  BEGIN
    PERFORM public.record_rental_payment(v_org,v_bill,gen_random_uuid(),current_date,1,NULL);
    RAISE EXCEPTION 'unauthorized payment accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.begin_boleto_change(v_org,v_contract,v_bill,gen_random_uuid());
    RAISE EXCEPTION 'unauthorized begin accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.finish_boleto_change(v_org,v_contract,v_bill,gen_random_uuid());
    RAISE EXCEPTION 'unauthorized finish accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.finalize_billing_delivery(v_org,v_bill,now(),ARRAY['qa@example.invalid'],NULL,gen_random_uuid(),NULL,1);
    RAISE EXCEPTION 'unauthorized send accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
END;
$$;
ROLLBACK;
SELECT 'PASS: owner, old-admin denial, RPC guards, idempotency, settlement, overpayment, direct insert denial, audit once; all QA rolled back' AS result;
