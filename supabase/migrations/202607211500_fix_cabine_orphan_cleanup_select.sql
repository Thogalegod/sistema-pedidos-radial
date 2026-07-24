DROP POLICY IF EXISTS
  "Cabine orphan documents selectable for cleanup by organization members"
ON storage.objects;

CREATE POLICY
  "Cabine orphan documents selectable for cleanup by organization members"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documentos-cabine'
  AND array_length(storage.foldername(name), 1) = 2
  AND (storage.foldername(name))[2]
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND storage.allow_any_operation(
    ARRAY[
      'storage.object.delete',
      'storage.object.delete_many'
    ]
  )
  AND EXISTS (
    SELECT 1
    FROM public.organizations AS organization
    WHERE organization.id::text = (storage.foldername(name))[1]
      AND public.is_organization_member(organization.id)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.relatorios_cabine AS referenced_report
    WHERE referenced_report.organization_id::text =
          (storage.foldername(name))[1]
      AND referenced_report.art_storage_path = storage.objects.name
  )
);
