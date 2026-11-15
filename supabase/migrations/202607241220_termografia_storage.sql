-- Private image storage for Termografia.
-- Object names must be: <organization_id>/<report_id>/<point_id>/<arquivo>.

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'termografia-docs',
  'termografia-docs',
  false,
  10485760,
  ARRAY[
    'image/*'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.is_termografia_storage_orphan_cleanup_object(object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  folders text[];
  object_org_id uuid;
  object_report_id uuid;
  object_point_id uuid;
BEGIN
  folders := storage.foldername(object_name);

  IF array_length(folders, 1) <> 3 THEN
    RETURN false;
  END IF;

  IF folders[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR folders[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR folders[3] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;

  object_org_id := folders[1]::uuid;
  object_report_id := folders[2]::uuid;
  object_point_id := folders[3]::uuid;

  RETURN public.is_organization_member(object_org_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.termografia_arquivos AS referenced_file
      WHERE referenced_file.organization_id = object_org_id
        AND referenced_file.report_id = object_report_id
        AND referenced_file.point_id = object_point_id
        AND referenced_file.storage_path = object_name
    );
END;
$$;

REVOKE ALL ON FUNCTION public.is_termografia_storage_orphan_cleanup_object(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_termografia_storage_orphan_cleanup_object(text) TO authenticated;

CREATE POLICY "Termografia images storage read by organization members"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'termografia-docs'
  AND array_length(storage.foldername(name), 1) = 3
  AND EXISTS (
    SELECT 1
    FROM public.termografia_pontos AS point
    JOIN public.relatorios_termografia AS report
      ON report.organization_id = point.organization_id
     AND report.id = point.report_id
    JOIN public.termografia_arquivos AS registered_file
      ON registered_file.organization_id = point.organization_id
     AND registered_file.report_id = point.report_id
     AND registered_file.point_id = point.id
     AND registered_file.storage_path = storage.objects.name
    WHERE point.organization_id::text = (storage.foldername(name))[1]
      AND point.report_id::text = (storage.foldername(name))[2]
      AND point.id::text = (storage.foldername(name))[3]
      AND public.is_organization_member(point.organization_id)
  )
);

CREATE POLICY "Termografia images storage insert by organization members"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'termografia-docs'
  AND array_length(storage.foldername(name), 1) = 3
  AND EXISTS (
    SELECT 1
    FROM public.termografia_pontos AS point
    JOIN public.relatorios_termografia AS report
      ON report.organization_id = point.organization_id
     AND report.id = point.report_id
    WHERE point.organization_id::text = (storage.foldername(name))[1]
      AND point.report_id::text = (storage.foldername(name))[2]
      AND point.id::text = (storage.foldername(name))[3]
      AND public.is_organization_member(point.organization_id)
  )
);

-- Deletion flow:
-- 1. load public.termografia_arquivos rows;
-- 2. remove Storage objects while normal report and point context still exists;
-- 3. confirm every Storage removal;
-- 4. remove public.termografia_arquivos rows;
-- 5. then delete the point or report;
-- 6. use the limited orphan cleanup policy only for recovery.
CREATE POLICY "Termografia images storage delete registered by organization members"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'termografia-docs'
  AND array_length(storage.foldername(name), 1) = 3
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1
    FROM public.termografia_arquivos AS registered_file
    JOIN public.termografia_pontos AS point
      ON point.organization_id = registered_file.organization_id
     AND point.report_id = registered_file.report_id
     AND point.id = registered_file.point_id
    JOIN public.relatorios_termografia AS report
      ON report.organization_id = point.organization_id
     AND report.id = point.report_id
    WHERE registered_file.storage_path = storage.objects.name
      AND registered_file.organization_id = point.organization_id
      AND registered_file.report_id = point.report_id
      AND registered_file.point_id = point.id
      AND registered_file.organization_id::text = (storage.foldername(name))[1]
      AND registered_file.report_id::text = (storage.foldername(name))[2]
      AND registered_file.point_id::text = (storage.foldername(name))[3]
      AND public.is_organization_member(point.organization_id)
  )
);

CREATE POLICY "Termografia images storage delete orphan by organization members"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'termografia-docs'
  AND public.is_termografia_storage_orphan_cleanup_object(storage.objects.name)
);

CREATE POLICY "Termografia orphan images selectable for cleanup by organization members"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'termografia-docs'
  AND storage.allow_any_operation(
    ARRAY[
      'storage.object.delete',
      'storage.object.delete_many'
    ]
  )
  AND public.is_termografia_storage_orphan_cleanup_object(storage.objects.name)
);
