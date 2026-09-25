ALTER TABLE public.billing_cycles
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

ALTER TABLE public.contract_documents
  ADD COLUMN IF NOT EXISTS payment_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contract_documents_payment_proof_required_fields_chk'
      AND conrelid = 'public.contract_documents'::regclass
  ) THEN
    ALTER TABLE public.contract_documents
      ADD CONSTRAINT contract_documents_payment_proof_required_fields_chk
      CHECK (
        kind <> 'payment_proof'
        OR (
          billing_cycle_id IS NOT NULL
          AND payment_id IS NOT NULL
          AND content_type IN ('application/pdf', 'image/png', 'image/jpeg')
        )
      )
      NOT VALID;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS billing_cycles_org_contract_id_uidx
  ON public.billing_cycles (organization_id, contract_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS payments_org_billing_cycle_id_uidx
  ON public.payments (organization_id, billing_cycle_id, id);

CREATE INDEX IF NOT EXISTS contract_documents_org_contract_billing_idx
  ON public.contract_documents (organization_id, contract_id, billing_cycle_id)
  WHERE billing_cycle_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS contract_documents_org_billing_payment_idx
  ON public.contract_documents (organization_id, billing_cycle_id, payment_id)
  WHERE payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS contract_documents_one_payment_proof_per_payment_uidx
  ON public.contract_documents (organization_id, payment_id)
  WHERE kind = 'payment_proof' AND payment_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contract_documents_billing_cycle_contract_org_fkey'
      AND conrelid = 'public.contract_documents'::regclass
  ) THEN
    ALTER TABLE public.contract_documents
      ADD CONSTRAINT contract_documents_billing_cycle_contract_org_fkey
      FOREIGN KEY (organization_id, contract_id, billing_cycle_id)
      REFERENCES public.billing_cycles (organization_id, contract_id, id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contract_documents_payment_billing_cycle_org_fkey'
      AND conrelid = 'public.contract_documents'::regclass
  ) THEN
    ALTER TABLE public.contract_documents
      ADD CONSTRAINT contract_documents_payment_billing_cycle_org_fkey
      FOREIGN KEY (organization_id, billing_cycle_id, payment_id)
      REFERENCES public.payments (organization_id, billing_cycle_id, id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END
$$;

DROP POLICY IF EXISTS "Contract documents storage read by organization members" ON storage.objects;
CREATE POLICY "Contract documents storage read by organization members"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'contratos-locacoes-docs'
  AND EXISTS (
    SELECT 1
    FROM public.contracts AS contract
    JOIN public.organization_members AS membership
      ON membership.organization_id = contract.organization_id
    WHERE membership.user_id = auth.uid()
      AND array_length(storage.foldername(name), 1) = 3
      AND contract.organization_id::text = (storage.foldername(name))[1]
      AND contract.id::text = (storage.foldername(name))[2]
      AND (storage.foldername(name))[3] IN ('remittance_nf', 'payment_proof')
  )
);

DROP POLICY IF EXISTS "Contract documents storage insert by organization members" ON storage.objects;
CREATE POLICY "Contract documents storage insert by organization members"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'contratos-locacoes-docs'
  AND EXISTS (
    SELECT 1
    FROM public.contracts AS contract
    JOIN public.organization_members AS membership
      ON membership.organization_id = contract.organization_id
    WHERE membership.user_id = auth.uid()
      AND array_length(storage.foldername(name), 1) = 3
      AND contract.organization_id::text = (storage.foldername(name))[1]
      AND contract.id::text = (storage.foldername(name))[2]
      AND (
        (
          (storage.foldername(name))[3] = 'remittance_nf'
          AND contract.kind = 'rental'::public.contract_kind
          AND contract.has_remittance_invoice = true
        )
        OR (
          (storage.foldername(name))[3] = 'payment_proof'
          AND (storage.objects.metadata ->> 'mimetype') IN ('application/pdf', 'image/png', 'image/jpeg')
          AND EXISTS (
            SELECT 1
            FROM public.payments AS payment
            JOIN public.billing_cycles AS billing
              ON billing.organization_id = payment.organization_id
             AND billing.id = payment.billing_cycle_id
            WHERE payment.organization_id = contract.organization_id
              AND payment.id = substring(
                storage.filename(name)
                from '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
              )::uuid
              AND billing.contract_id = contract.id
          )
        )
      )
  )
);

DROP POLICY IF EXISTS "Contract documents storage delete orphan uploads by owner" ON storage.objects;
CREATE POLICY "Contract documents storage delete orphan uploads by owner"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'contratos-locacoes-docs'
  AND owner_id = auth.uid()::text
  AND array_length(storage.foldername(name), 1) = 3
  AND (storage.foldername(name))[3] IN ('remittance_nf', 'payment_proof')
  AND EXISTS (
    SELECT 1
    FROM public.contracts AS contract
    JOIN public.organization_members AS membership
      ON membership.organization_id = contract.organization_id
    WHERE membership.user_id = auth.uid()
      AND contract.organization_id::text = (storage.foldername(name))[1]
      AND contract.id::text = (storage.foldername(name))[2]
      AND NOT EXISTS (
        SELECT 1
        FROM public.contract_documents AS document
        WHERE document.organization_id = contract.organization_id
          AND document.contract_id = contract.id
          AND document.kind = (storage.foldername(name))[3]
          AND document.storage_path = storage.objects.name
      )
  )
);
