-- Private attachment storage for Pedidos.
-- Object names must be: <organization_id>/<pedido_id>/<arquivo>.

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'anexos-pedidos',
  'anexos-pedidos',
  false,
  10485760,
  ARRAY[
    'image/*',
    'application/pdf'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Order attachments storage read by organization members"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'anexos-pedidos'
  AND array_length(storage.foldername(name), 1) = 2
  AND EXISTS (
    SELECT 1
    FROM public.pedidos AS pedido
    WHERE pedido.organization_id::text = (storage.foldername(name))[1]
      AND pedido.id::text = (storage.foldername(name))[2]
      AND public.is_organization_member(pedido.organization_id)
  )
);

CREATE POLICY "Order attachments storage insert by organization members"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'anexos-pedidos'
  AND array_length(storage.foldername(name), 1) = 2
  AND EXISTS (
    SELECT 1
    FROM public.pedidos AS pedido
    WHERE pedido.organization_id::text = (storage.foldername(name))[1]
      AND pedido.id::text = (storage.foldername(name))[2]
      AND public.is_organization_member(pedido.organization_id)
  )
);

CREATE POLICY "Order attachments storage delete by organization members"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'anexos-pedidos'
  AND array_length(storage.foldername(name), 1) = 2
  AND EXISTS (
    SELECT 1
    FROM public.pedidos AS pedido
    WHERE pedido.organization_id::text = (storage.foldername(name))[1]
      AND pedido.id::text = (storage.foldername(name))[2]
      AND public.is_organization_member(pedido.organization_id)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.anexos AS attachment
    WHERE attachment.organization_id::text = (storage.foldername(name))[1]
      AND attachment.pedido_id::text = (storage.foldername(name))[2]
      AND attachment.storage_path = storage.objects.name
  )
);
