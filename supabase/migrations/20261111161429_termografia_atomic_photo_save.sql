CREATE OR REPLACE FUNCTION public.save_termografia_photo(
  p_organization_id uuid, p_report_id uuid, p_point_id uuid, p_file_id uuid,
  p_tipo text, p_file_name text, p_content_type text, p_tamanho_bytes bigint,
  p_previous_file_id uuid DEFAULT NULL
) RETURNS SETOF public.termografia_arquivos
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_current public.termografia_arquivos;
  v_saved public.termografia_arquivos;
  v_path text;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.is_organization_member(p_organization_id), false) THEN
    RAISE EXCEPTION 'Sem acesso à organização da Termografia' USING ERRCODE = '42501';
  END IF;
  -- Serialize saves for the point, including two concurrent first uploads.
  PERFORM id FROM public.termografia_pontos
    WHERE organization_id=p_organization_id AND report_id=p_report_id AND id=p_point_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ponto de Termografia não encontrado'; END IF;

  v_path := p_organization_id::text || '/' || p_report_id::text || '/' || p_point_id::text || '/' || p_file_name;
  SELECT * INTO v_current FROM public.termografia_arquivos
    WHERE organization_id=p_organization_id AND point_id=p_point_id AND tipo=p_tipo FOR UPDATE;
  IF v_current.id = p_file_id THEN
    IF v_current.storage_path IS DISTINCT FROM v_path
       OR v_current.content_type IS DISTINCT FROM p_content_type
       OR v_current.tamanho_bytes IS DISTINCT FROM p_tamanho_bytes THEN
      RAISE EXCEPTION 'Identificador de envio já utilizado para outra foto';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='termografia-docs' AND name=v_path) THEN
      RAISE EXCEPTION 'Upload da foto não foi confirmado';
    END IF;
    RETURN NEXT v_current;
    RETURN;
  END IF;
  IF v_current.id IS DISTINCT FROM p_previous_file_id THEN
    RAISE EXCEPTION 'A foto foi alterada em outra sessão. Reabra o relatório antes de substituir.';
  END IF;
  IF v_current.id IS NOT NULL THEN
    DELETE FROM public.termografia_arquivos WHERE id=v_current.id AND organization_id=p_organization_id;
  END IF;
  -- Constraint/RLS failure rolls back the deletion and preserves prior metadata.
  INSERT INTO public.termografia_arquivos(
    id,organization_id,report_id,point_id,tipo,storage_path,file_name,content_type,tamanho_bytes
  ) VALUES (p_file_id,p_organization_id,p_report_id,p_point_id,p_tipo,v_path,p_file_name,p_content_type,p_tamanho_bytes)
    RETURNING * INTO v_saved;
  -- Storage SELECT intentionally requires registered metadata. Validate after
  -- the swap, inside this transaction, so missing bytes roll back the swap.
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='termografia-docs' AND name=v_path) THEN
    RAISE EXCEPTION 'Upload da foto não foi confirmado';
  END IF;
  RETURN NEXT v_saved;
END;
$function$;
REVOKE ALL ON FUNCTION public.save_termografia_photo(uuid,uuid,uuid,uuid,text,text,text,bigint,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_termografia_photo(uuid,uuid,uuid,uuid,text,text,text,bigint,uuid) TO authenticated;
