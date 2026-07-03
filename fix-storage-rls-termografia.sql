-- ============================================================
-- POLÍTICA RLS PARA UPLOAD DE FOTOS TERMOGRAFIA
-- Rode isso no Supabase SQL Editor
-- ============================================================

-- 1. Permitir que usuários autenticados façam upload na pasta termografia/
CREATE POLICY "Usuarios autenticados podem fazer upload de fotos termografia"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documentos-cabine'
  AND (storage.foldername(name))[1] = 'termografia'
);

-- 2. Permitir que usuários autenticados leiam fotos da pasta termografia/
CREATE POLICY "Usuarios autenticados podem ver fotos termografia"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documentos-cabine'
  AND (storage.foldername(name))[1] = 'termografia'
);

-- 3. Permitir que usuários autenticados deletem fotos da pasta termografia/
CREATE POLICY "Usuarios autenticados podem deletar fotos termografia"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'documentos-cabine'
  AND (storage.foldername(name))[1] = 'termografia'
);

-- 4. Permitir que usuários autenticados atualizem (upsert) fotos da pasta termografia/
CREATE POLICY "Usuarios autenticados podem atualizar fotos termografia"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documentos-cabine'
  AND (storage.foldername(name))[1] = 'termografia'
);
