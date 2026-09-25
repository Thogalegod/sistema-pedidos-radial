-- Lote A: billing capability, boleto coordination, revision tracking and delivery history.

ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS can_manage_billing boolean NOT NULL DEFAULT false;

ALTER TABLE public.billing_cycles
  ADD COLUMN IF NOT EXISTS needs_resend boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS content_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS boleto_change_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS boleto_change_operation_id uuid,
  ADD COLUMN IF NOT EXISTS boleto_change_started_at timestamptz;

ALTER TABLE public.billing_cycles
  ADD CONSTRAINT billing_cycles_content_revision_nonnegative_chk
  CHECK (content_revision >= 0),
  ADD CONSTRAINT billing_cycles_boleto_change_state_chk
  CHECK (
    (
      boleto_change_pending
      AND boleto_change_operation_id IS NOT NULL
      AND boleto_change_started_at IS NOT NULL
    )
    OR (
      NOT boleto_change_pending
      AND boleto_change_started_at IS NULL
    )
  );

ALTER TABLE public.contract_documents
  DROP CONSTRAINT IF EXISTS contract_documents_kind_check;

ALTER TABLE public.contract_documents
  ADD CONSTRAINT contract_documents_kind_check
  CHECK (
    kind IN (
      'order', 'shipping', 'contract', 'receipt_nf', 'payment_proof',
      'remittance_nf', 'boleto', 'other'
    )
  );

ALTER TABLE public.contract_documents
  ADD CONSTRAINT contract_documents_boleto_required_fields_chk
  CHECK (
    kind <> 'boleto'
    OR (
      billing_cycle_id IS NOT NULL
      AND payment_id IS NULL
      AND inspection_id IS NULL
      AND content_type = 'application/pdf'
      AND storage_path = organization_id::text || '/' || contract_id::text
        || '/boleto/' || billing_cycle_id::text || '.pdf'
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.contract_documents'::regclass
      AND conname = 'contract_documents_contract_org_fkey'
  ) THEN
    RAISE EXCEPTION 'required constraint contract_documents_contract_org_fkey is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.contract_documents'::regclass
      AND conname = 'contract_documents_billing_cycle_contract_org_fkey'
  ) THEN
    RAISE EXCEPTION 'required constraint contract_documents_billing_cycle_contract_org_fkey is missing';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS contract_documents_one_boleto_per_billing_uidx
  ON public.contract_documents (organization_id, billing_cycle_id)
  WHERE kind = 'boleto';

CREATE INDEX IF NOT EXISTS contracts_org_site_idx
  ON public.contracts (organization_id, site_id);

CREATE TABLE public.billing_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  billing_cycle_id uuid NOT NULL,
  sent_at timestamptz NOT NULL,
  recipients text[] NOT NULL,
  provider_message_id text NOT NULL UNIQUE,
  send_request_id uuid NOT NULL UNIQUE,
  additional_message text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_delivery_events_cycle_org_fkey
    FOREIGN KEY (organization_id, billing_cycle_id)
    REFERENCES public.billing_cycles (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_delivery_events_recipients_cardinality_chk
    CHECK (cardinality(recipients) BETWEEN 1 AND 50)
);

CREATE INDEX IF NOT EXISTS billing_delivery_events_cycle_sent_idx
  ON public.billing_delivery_events (organization_id, billing_cycle_id, sent_at DESC);

ALTER TABLE public.billing_delivery_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.billing_delivery_events
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.billing_delivery_events TO authenticated;

CREATE POLICY "Billing delivery events select by billing managers"
ON public.billing_delivery_events
FOR SELECT
TO authenticated
USING (
  (select auth.uid()) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.organization_id = billing_delivery_events.organization_id
      AND membership.user_id = (select auth.uid())
      AND (membership.role = 'admin' OR membership.can_manage_billing = true)
  )
);

CREATE POLICY "Billing delivery events insert by billing managers"
ON public.billing_delivery_events
FOR INSERT
TO authenticated
WITH CHECK (
  (select auth.uid()) IS NOT NULL
  AND created_by = (select auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.organization_id = billing_delivery_events.organization_id
      AND membership.user_id = (select auth.uid())
      AND (membership.role = 'admin' OR membership.can_manage_billing = true)
  )
  AND EXISTS (
    SELECT 1
    FROM public.billing_cycles AS billing
    WHERE billing.organization_id = billing_delivery_events.organization_id
      AND billing.id = billing_delivery_events.billing_cycle_id
  )
);

REVOKE INSERT ON TABLE public.billing_cycles FROM PUBLIC, anon, authenticated;
REVOKE UPDATE ON TABLE public.billing_cycles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.billing_cycles TO authenticated;
GRANT INSERT (
  organization_id, contract_id, sequence_number, period_start, period_end,
  issue_date, due_date, base_amount, discount_amount, surcharge_amount,
  exemption_amount, total_amount, document_type, document_number, status, notes
) ON public.billing_cycles TO authenticated;
GRANT UPDATE (
  period_start, period_end, issue_date, due_date, notes, status, needs_resend
) ON public.billing_cycles TO authenticated;

REVOKE UPDATE ON TABLE public.billing_lines FROM PUBLIC, anon, authenticated;
GRANT UPDATE (
  organization_id, billing_cycle_id, rental_item_id, description, quantity,
  unit_amount, total_amount, kind, updated_at
) ON public.billing_lines TO authenticated;

DROP POLICY IF EXISTS "Contract Documents SELECT policy" ON public.contract_documents;
DROP POLICY IF EXISTS "Contract Documents INSERT policy" ON public.contract_documents;
DROP POLICY IF EXISTS "Contract Documents UPDATE policy" ON public.contract_documents;

CREATE POLICY "Contract documents non-boleto select by organization members"
ON public.contract_documents
FOR SELECT
TO authenticated
USING (
  kind <> 'boleto'
  AND public.is_organization_member(organization_id)
);

CREATE POLICY "Contract documents non-boleto insert by organization members"
ON public.contract_documents
FOR INSERT
TO authenticated
WITH CHECK (
  kind <> 'boleto'
  AND public.is_organization_member(organization_id)
);

CREATE POLICY "Boleto documents select by billing managers"
ON public.contract_documents
FOR SELECT
TO authenticated
USING (
  kind = 'boleto'
  AND (select auth.uid()) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.organization_id = contract_documents.organization_id
      AND membership.user_id = (select auth.uid())
      AND (membership.role = 'admin' OR membership.can_manage_billing = true)
  )
);

CREATE POLICY "Boleto documents insert by billing managers"
ON public.contract_documents
FOR INSERT
TO authenticated
WITH CHECK (
  kind = 'boleto'
  AND (select auth.uid()) IS NOT NULL
  AND created_by = (select auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.organization_id = contract_documents.organization_id
      AND membership.user_id = (select auth.uid())
      AND (membership.role = 'admin' OR membership.can_manage_billing = true)
  )
);

CREATE POLICY "Boleto storage select by billing managers"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'contratos-locacoes-docs'
  AND (select auth.uid()) IS NOT NULL
  AND array_length(storage.foldername(name), 1) = 3
  AND (storage.foldername(name))[3] = 'boleto'
  AND EXISTS (
    SELECT 1
    FROM public.contracts AS contract
    JOIN public.billing_cycles AS billing
      ON billing.organization_id = contract.organization_id
     AND billing.contract_id = contract.id
    JOIN public.organization_members AS membership
      ON membership.organization_id = contract.organization_id
     AND membership.user_id = (select auth.uid())
    WHERE contract.organization_id::text = (storage.foldername(name))[1]
      AND contract.id::text = (storage.foldername(name))[2]
      AND storage.filename(name) = billing.id::text || '.pdf'
      AND (membership.role = 'admin' OR membership.can_manage_billing = true)
      AND (
        EXISTS (
          SELECT 1
          FROM public.contract_documents AS document
          WHERE document.organization_id = contract.organization_id
            AND document.contract_id = contract.id
            AND document.billing_cycle_id = billing.id
            AND document.kind = 'boleto'
            AND document.storage_path = storage.objects.name
        )
        OR (
          billing.boleto_change_pending = true
          AND billing.boleto_change_operation_id IS NOT NULL
          AND billing.boleto_change_started_at IS NOT NULL
        )
      )
  )
);

CREATE POLICY "Boleto storage insert by billing managers"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'contratos-locacoes-docs'
  AND (select auth.uid()) IS NOT NULL
  AND array_length(storage.foldername(name), 1) = 3
  AND (storage.foldername(name))[3] = 'boleto'
  AND (storage.objects.metadata ->> 'mimetype') = 'application/pdf'
  AND EXISTS (
    SELECT 1
    FROM public.contracts AS contract
    JOIN public.billing_cycles AS billing
      ON billing.organization_id = contract.organization_id
     AND billing.contract_id = contract.id
    JOIN public.organization_members AS membership
      ON membership.organization_id = contract.organization_id
     AND membership.user_id = (select auth.uid())
    WHERE contract.organization_id::text = (storage.foldername(name))[1]
      AND contract.id::text = (storage.foldername(name))[2]
      AND storage.filename(name) = billing.id::text || '.pdf'
      AND (membership.role = 'admin' OR membership.can_manage_billing = true)
      AND billing.boleto_change_pending = true
      AND billing.boleto_change_operation_id IS NOT NULL
      AND billing.boleto_change_started_at IS NOT NULL
  )
);

CREATE POLICY "Boleto storage update by billing managers"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'contratos-locacoes-docs'
  AND (select auth.uid()) IS NOT NULL
  AND array_length(storage.foldername(name), 1) = 3
  AND (storage.foldername(name))[3] = 'boleto'
  AND EXISTS (
    SELECT 1
    FROM public.contracts AS contract
    JOIN public.billing_cycles AS billing
      ON billing.organization_id = contract.organization_id
     AND billing.contract_id = contract.id
    JOIN public.organization_members AS membership
      ON membership.organization_id = contract.organization_id
     AND membership.user_id = (select auth.uid())
    WHERE contract.organization_id::text = (storage.foldername(name))[1]
      AND contract.id::text = (storage.foldername(name))[2]
      AND storage.filename(name) = billing.id::text || '.pdf'
      AND (membership.role = 'admin' OR membership.can_manage_billing = true)
      AND billing.boleto_change_pending = true
      AND billing.boleto_change_operation_id IS NOT NULL
      AND billing.boleto_change_started_at IS NOT NULL
    FOR SHARE OF billing
  )
)
WITH CHECK (
  bucket_id = 'contratos-locacoes-docs'
  AND (select auth.uid()) IS NOT NULL
  AND array_length(storage.foldername(name), 1) = 3
  AND (storage.foldername(name))[3] = 'boleto'
  AND (storage.objects.metadata ->> 'mimetype') = 'application/pdf'
  AND EXISTS (
    SELECT 1
    FROM public.contracts AS contract
    JOIN public.billing_cycles AS billing
      ON billing.organization_id = contract.organization_id
     AND billing.contract_id = contract.id
    JOIN public.organization_members AS membership
      ON membership.organization_id = contract.organization_id
     AND membership.user_id = (select auth.uid())
    WHERE contract.organization_id::text = (storage.foldername(name))[1]
      AND contract.id::text = (storage.foldername(name))[2]
      AND storage.filename(name) = billing.id::text || '.pdf'
      AND (membership.role = 'admin' OR membership.can_manage_billing = true)
      AND billing.boleto_change_pending = true
      AND billing.boleto_change_operation_id IS NOT NULL
      AND billing.boleto_change_started_at IS NOT NULL
    FOR SHARE OF billing
  )
);

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.guard_and_bump_billing_cycle_content_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF OLD.needs_resend = true
     AND NEW.needs_resend = false
     AND current_user IN ('anon', 'authenticated', 'service_role') THEN
    RAISE EXCEPTION 'needs_resend cannot be cleared by API roles' USING ERRCODE = '42501';
  END IF;

  IF OLD.contract_id IS DISTINCT FROM NEW.contract_id
     OR OLD.sequence_number IS DISTINCT FROM NEW.sequence_number
     OR OLD.period_start IS DISTINCT FROM NEW.period_start
     OR OLD.period_end IS DISTINCT FROM NEW.period_end
     OR OLD.issue_date IS DISTINCT FROM NEW.issue_date
     OR OLD.due_date IS DISTINCT FROM NEW.due_date
     OR OLD.base_amount IS DISTINCT FROM NEW.base_amount
     OR OLD.discount_amount IS DISTINCT FROM NEW.discount_amount
     OR OLD.surcharge_amount IS DISTINCT FROM NEW.surcharge_amount
     OR OLD.exemption_amount IS DISTINCT FROM NEW.exemption_amount
     OR OLD.total_amount IS DISTINCT FROM NEW.total_amount
     OR OLD.document_number IS DISTINCT FROM NEW.document_number
     OR OLD.notes IS DISTINCT FROM NEW.notes THEN
    NEW.content_revision := OLD.content_revision + 1;
    IF OLD.sent_at IS NOT NULL THEN
      NEW.needs_resend := true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER billing_cycles_content_revision_guard_trg
BEFORE UPDATE ON public.billing_cycles
FOR EACH ROW
EXECUTE FUNCTION private.guard_and_bump_billing_cycle_content_revision();

CREATE OR REPLACE FUNCTION private.bump_billing_line_content_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_affected record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.kind NOT IN ('recurring', 'damage') THEN RETURN NEW; END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.kind NOT IN ('recurring', 'damage') THEN RETURN OLD; END IF;
  ELSE
    IF NOT (
      (OLD.kind IN ('recurring', 'damage') OR NEW.kind IN ('recurring', 'damage'))
      AND (
        OLD.organization_id IS DISTINCT FROM NEW.organization_id
        OR OLD.billing_cycle_id IS DISTINCT FROM NEW.billing_cycle_id
        OR OLD.description IS DISTINCT FROM NEW.description
        OR OLD.quantity IS DISTINCT FROM NEW.quantity
        OR OLD.kind IS DISTINCT FROM NEW.kind
        OR OLD.unit_amount IS DISTINCT FROM NEW.unit_amount
        OR OLD.total_amount IS DISTINCT FROM NEW.total_amount
      )
    ) THEN RETURN NEW; END IF;
  END IF;

  IF (select auth.uid()) IS NOT NULL THEN
    IF TG_OP <> 'INSERT' AND NOT EXISTS (
      SELECT 1 FROM public.organization_members AS membership
      WHERE membership.organization_id = OLD.organization_id
        AND membership.user_id = (select auth.uid())
    ) THEN
      RAISE EXCEPTION 'source organization membership required' USING ERRCODE = '42501';
    END IF;
    IF TG_OP <> 'DELETE' AND NOT EXISTS (
      SELECT 1 FROM public.organization_members AS membership
      WHERE membership.organization_id = NEW.organization_id
        AND membership.user_id = (select auth.uid())
    ) THEN
      RAISE EXCEPTION 'destination organization membership required' USING ERRCODE = '42501';
    END IF;
  END IF;

  FOR v_affected IN
    SELECT billing.organization_id, billing.id
    FROM public.billing_cycles AS billing
    WHERE
      (
        TG_OP <> 'INSERT'
        AND OLD.kind IN ('recurring', 'damage')
        AND billing.organization_id = OLD.organization_id
        AND billing.id = OLD.billing_cycle_id
      )
      OR (
        TG_OP <> 'DELETE'
        AND NEW.kind IN ('recurring', 'damage')
        AND billing.organization_id = NEW.organization_id
        AND billing.id = NEW.billing_cycle_id
      )
    ORDER BY billing.organization_id, billing.id
    FOR UPDATE
  LOOP
    UPDATE public.billing_cycles
    SET content_revision = content_revision + 1,
        needs_resend = CASE WHEN sent_at IS NOT NULL THEN true ELSE needs_resend END
    WHERE organization_id = v_affected.organization_id AND id = v_affected.id;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER billing_lines_content_revision_trg
AFTER INSERT OR UPDATE OR DELETE ON public.billing_lines
FOR EACH ROW
EXECUTE FUNCTION private.bump_billing_line_content_revision();

CREATE OR REPLACE FUNCTION private.bump_contract_content_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_cycle_id uuid;
BEGIN
  IF NOT (
    OLD.internal_number IS DISTINCT FROM NEW.internal_number
    OR OLD.contract_company IS DISTINCT FROM NEW.contract_company
    OR OLD.customer_id IS DISTINCT FROM NEW.customer_id
    OR OLD.site_id IS DISTINCT FROM NEW.site_id
    OR OLD.legacy_order_number IS DISTINCT FROM NEW.legacy_order_number
    OR OLD.notes IS DISTINCT FROM NEW.notes
    OR OLD.has_remittance_invoice IS DISTINCT FROM NEW.has_remittance_invoice
    OR OLD.remittance_invoice_number IS DISTINCT FROM NEW.remittance_invoice_number
    OR OLD.remittance_invoice_issue_date IS DISTINCT FROM NEW.remittance_invoice_issue_date
  ) THEN RETURN NEW; END IF;

  IF (select auth.uid()) IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_members AS membership
    WHERE membership.organization_id = NEW.organization_id
      AND membership.user_id = (select auth.uid())
  ) THEN RAISE EXCEPTION 'organization membership required' USING ERRCODE = '42501'; END IF;

  FOR v_cycle_id IN
    SELECT billing.id FROM public.billing_cycles AS billing
    WHERE billing.organization_id = NEW.organization_id AND billing.contract_id = NEW.id
    ORDER BY billing.id FOR UPDATE
  LOOP
    UPDATE public.billing_cycles
    SET content_revision = content_revision + 1,
        needs_resend = CASE WHEN sent_at IS NOT NULL THEN true ELSE needs_resend END
    WHERE organization_id = NEW.organization_id AND id = v_cycle_id;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER contracts_content_revision_trg
AFTER UPDATE ON public.contracts
FOR EACH ROW EXECUTE FUNCTION private.bump_contract_content_revision();

CREATE OR REPLACE FUNCTION private.bump_customer_content_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_cycle_id uuid;
BEGIN
  IF NOT (
    OLD.legal_name IS DISTINCT FROM NEW.legal_name
    OR OLD.trade_name IS DISTINCT FROM NEW.trade_name
    OR OLD.tax_id IS DISTINCT FROM NEW.tax_id
    OR OLD.state_registration IS DISTINCT FROM NEW.state_registration
  ) THEN RETURN NEW; END IF;

  IF (select auth.uid()) IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_members AS membership
    WHERE membership.organization_id = NEW.organization_id
      AND membership.user_id = (select auth.uid())
  ) THEN RAISE EXCEPTION 'organization membership required' USING ERRCODE = '42501'; END IF;

  FOR v_cycle_id IN
    SELECT billing.id
    FROM public.contracts AS contract
    JOIN public.billing_cycles AS billing
      ON billing.organization_id = contract.organization_id AND billing.contract_id = contract.id
    WHERE contract.organization_id = NEW.organization_id AND contract.customer_id = NEW.id
    ORDER BY billing.id FOR UPDATE OF billing
  LOOP
    UPDATE public.billing_cycles
    SET content_revision = content_revision + 1,
        needs_resend = CASE WHEN sent_at IS NOT NULL THEN true ELSE needs_resend END
    WHERE organization_id = NEW.organization_id AND id = v_cycle_id;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER customers_content_revision_trg
AFTER UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION private.bump_customer_content_revision();

CREATE OR REPLACE FUNCTION private.bump_customer_site_content_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_cycle_id uuid;
BEGIN
  IF NOT (
    OLD.name IS DISTINCT FROM NEW.name
    OR OLD.address_line IS DISTINCT FROM NEW.address_line
    OR OLD.number IS DISTINCT FROM NEW.number
    OR OLD.complement IS DISTINCT FROM NEW.complement
    OR OLD.district IS DISTINCT FROM NEW.district
    OR OLD.city IS DISTINCT FROM NEW.city
    OR OLD.state IS DISTINCT FROM NEW.state
    OR OLD.postal_code IS DISTINCT FROM NEW.postal_code
  ) THEN RETURN NEW; END IF;

  IF (select auth.uid()) IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_members AS membership
    WHERE membership.organization_id = NEW.organization_id
      AND membership.user_id = (select auth.uid())
  ) THEN RAISE EXCEPTION 'organization membership required' USING ERRCODE = '42501'; END IF;

  FOR v_cycle_id IN
    SELECT billing.id
    FROM public.contracts AS contract
    JOIN public.billing_cycles AS billing
      ON billing.organization_id = contract.organization_id AND billing.contract_id = contract.id
    WHERE contract.organization_id = NEW.organization_id AND contract.site_id = NEW.id
    ORDER BY billing.id FOR UPDATE OF billing
  LOOP
    UPDATE public.billing_cycles
    SET content_revision = content_revision + 1,
        needs_resend = CASE WHEN sent_at IS NOT NULL THEN true ELSE needs_resend END
    WHERE organization_id = NEW.organization_id AND id = v_cycle_id;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER customer_sites_content_revision_trg
AFTER UPDATE ON public.customer_sites
FOR EACH ROW EXECUTE FUNCTION private.bump_customer_site_content_revision();

CREATE OR REPLACE FUNCTION public.begin_boleto_change(
  p_organization_id uuid,
  p_contract_id uuid,
  p_billing_cycle_id uuid,
  p_operation_id uuid
)
RETURNS TABLE (
  status text,
  operation_id uuid,
  started_at timestamptz,
  content_revision bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_billing public.billing_cycles%ROWTYPE;
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION public.finish_boleto_change(
  p_organization_id uuid,
  p_contract_id uuid,
  p_billing_cycle_id uuid,
  p_operation_id uuid
)
RETURNS TABLE (document jsonb, billing jsonb, already_finished boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_billing public.billing_cycles%ROWTYPE;
  v_document public.contract_documents%ROWTYPE;
  v_path text;
  v_object_updated_at timestamptz;
  v_object_mimetype text;
BEGIN
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
$$;

ALTER FUNCTION private.guard_and_bump_billing_cycle_content_revision() OWNER TO postgres;
ALTER FUNCTION private.bump_billing_line_content_revision() OWNER TO postgres;
ALTER FUNCTION private.bump_contract_content_revision() OWNER TO postgres;
ALTER FUNCTION private.bump_customer_content_revision() OWNER TO postgres;
ALTER FUNCTION private.bump_customer_site_content_revision() OWNER TO postgres;
ALTER FUNCTION public.begin_boleto_change(uuid, uuid, uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.finish_boleto_change(uuid, uuid, uuid, uuid) OWNER TO postgres;

REVOKE EXECUTE ON FUNCTION private.guard_and_bump_billing_cycle_content_revision()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION private.bump_billing_line_content_revision()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION private.bump_contract_content_revision()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION private.bump_customer_content_revision()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION private.bump_customer_site_content_revision()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.begin_boleto_change(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.finish_boleto_change(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.begin_boleto_change(uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_boleto_change(uuid, uuid, uuid, uuid) TO authenticated;
