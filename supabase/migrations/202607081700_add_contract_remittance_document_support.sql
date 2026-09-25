ALTER TABLE public.contract_documents
  DROP CONSTRAINT IF EXISTS contract_documents_kind_check;

ALTER TABLE public.contract_documents
  ADD CONSTRAINT contract_documents_kind_check
  CHECK (kind IN ('order', 'shipping', 'contract', 'receipt_nf', 'payment_proof', 'remittance_nf', 'other'));

CREATE UNIQUE INDEX IF NOT EXISTS contract_documents_one_remittance_nf_per_contract_uidx
  ON public.contract_documents (organization_id, contract_id)
  WHERE kind = 'remittance_nf';

GRANT SELECT, INSERT ON public.contract_documents TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contratos-locacoes-docs',
  'contratos-locacoes-docs',
  false,
  10485760,
  ARRAY['application/pdf', 'application/xml', 'text/xml', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

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
      AND (storage.foldername(name))[3] = 'remittance_nf'
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
      AND (storage.foldername(name))[3] = 'remittance_nf'
      AND contract.kind = 'rental'::public.contract_kind
      AND contract.has_remittance_invoice = true
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
  AND (storage.foldername(name))[3] = 'remittance_nf'
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
          AND document.kind = 'remittance_nf'
          AND document.storage_path = storage.objects.name
      )
  )
);
