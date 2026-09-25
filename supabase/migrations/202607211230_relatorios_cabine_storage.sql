-- Private PDF storage for Relatorios de Cabine.
-- Object names must be: <organization_id>/<relatorio_id>/<arquivo>.

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'documentos-cabine',
  'documentos-cabine',
  false,
  10485760,
  ARRAY[
    'application/pdf'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Cabine documents storage read by organization members"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documentos-cabine'
  AND array_length(storage.foldername(name), 1) = 2
  AND EXISTS (
    SELECT 1
    FROM public.relatorios_cabine AS report
    WHERE report.organization_id::text = (storage.foldername(name))[1]
      AND report.id::text = (storage.foldername(name))[2]
      AND report.art_storage_path = storage.objects.name
      AND public.is_organization_member(report.organization_id)
  )
);

CREATE POLICY "Cabine documents storage insert by organization members"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documentos-cabine'
  AND array_length(storage.foldername(name), 1) = 2
  AND EXISTS (
    SELECT 1
    FROM public.relatorios_cabine AS report
    WHERE report.organization_id::text = (storage.foldername(name))[1]
      AND report.id::text = (storage.foldername(name))[2]
      AND public.is_organization_member(report.organization_id)
  )
);

CREATE POLICY "Cabine documents storage delete by organization members"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'documentos-cabine'
  AND array_length(storage.foldername(name), 1) = 2
  AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1
    FROM public.organizations AS organization
    WHERE organization.id::text = (storage.foldername(name))[1]
      AND public.is_organization_member(organization.id)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.relatorios_cabine AS referenced_report
    WHERE referenced_report.organization_id::text = (storage.foldername(name))[1]
      AND referenced_report.art_storage_path = storage.objects.name
  )
);
