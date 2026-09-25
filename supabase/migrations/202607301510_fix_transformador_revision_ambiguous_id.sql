-- Fix ambiguous output column names in Transformador revision RPC.

CREATE OR REPLACE FUNCTION public.create_transformador_revision(
  p_organization_id uuid,
  p_original_id uuid,
  p_report jsonb
)
RETURNS TABLE (id uuid, numero_relatorio text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  original_report public.relatorios_transformador%ROWTYPE;
  v_original_report_id uuid;
  v_new_report_id uuid;
  v_new_report_number text;
  report_taps integer[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario autenticado obrigatorio para revisar relatorio de Transformador';
  END IF;

  IF NOT public.is_organization_member(p_organization_id) THEN
    RAISE EXCEPTION 'Usuario nao pertence a organizacao informada';
  END IF;

  SELECT original.*
    INTO original_report
    FROM public.relatorios_transformador AS original
   WHERE original.id = p_original_id
   FOR UPDATE;

  IF original_report.id IS NULL THEN
    RAISE EXCEPTION 'Relatorio original nao encontrado';
  END IF;

  v_original_report_id := original_report.id;

  IF original_report.organization_id <> p_organization_id THEN
    RAISE EXCEPTION 'Relatorio original nao pertence a organizacao ativa';
  END IF;

  IF original_report.status IN ('cancelado', 'revisado') THEN
    RAISE EXCEPTION 'Relatorio original nao pode ser revisado no status atual';
  END IF;

  IF original_report.superseded_by_id IS NOT NULL THEN
    RAISE EXCEPTION 'Relatorio original ja foi substituido';
  END IF;

  PERFORM set_config('app.transformador_revision_rpc', 'on', true);

  SELECT COALESCE(array_agg(value::integer), ARRAY[]::integer[])
    INTO report_taps
    FROM jsonb_array_elements_text(p_report->'taps') AS value;

  INSERT INTO public.relatorios_transformador AS inserted_report (
    organization_id,
    criado_por,
    revised_from_id,
    cliente_nome,
    cliente_endereco,
    cliente_cidade,
    cliente_uf,
    cliente_cnpj,
    cliente_ie,
    observacoes,
    fabricante,
    numero_serie,
    potencia_kva,
    tensao_at_nominal,
    tensao_bt,
    tensao_bt_label,
    resfriamento,
    grupo_ligacao,
    tipo_oleo,
    procedencia_oleo,
    tap_despacho,
    taps,
    responsavel_nome,
    responsavel_crea,
    data_relatorio,
    temperatura_c,
    umidade_relativa,
    valores_calculados,
    status
  )
  VALUES (
    p_organization_id,
    auth.uid(),
    v_original_report_id,
    p_report->>'cliente_nome',
    p_report->>'cliente_endereco',
    p_report->>'cliente_cidade',
    p_report->>'cliente_uf',
    NULLIF(p_report->>'cliente_cnpj', ''),
    NULLIF(p_report->>'cliente_ie', ''),
    NULLIF(p_report->>'observacoes', ''),
    NULLIF(p_report->>'fabricante', ''),
    NULLIF(p_report->>'numero_serie', ''),
    (p_report->>'potencia_kva')::numeric,
    (p_report->>'tensao_at_nominal')::integer,
    p_report->>'tensao_bt',
    p_report->>'tensao_bt_label',
    COALESCE(NULLIF(p_report->>'resfriamento', ''), 'LN'),
    COALESCE(NULLIF(p_report->>'grupo_ligacao', ''), 'Subtrativa'),
    COALESCE(NULLIF(p_report->>'tipo_oleo', ''), 'Mineral'),
    COALESCE(NULLIF(p_report->>'procedencia_oleo', ''), 'BR'),
    (p_report->>'tap_despacho')::integer,
    report_taps,
    COALESCE(NULLIF(p_report->>'responsavel_nome', ''), 'Roberto Fontes Lopes'),
    COALESCE(NULLIF(p_report->>'responsavel_crea', ''), 'CREA 060.104.922.9'),
    (p_report->>'data_relatorio')::date,
    COALESCE((p_report->>'temperatura_c')::numeric, 26),
    NULLIF(p_report->>'umidade_relativa', '')::numeric,
    p_report->'valores_calculados',
    'gerado'
  )
  RETURNING inserted_report.id, inserted_report.numero_relatorio
    INTO v_new_report_id, v_new_report_number;

  UPDATE public.relatorios_transformador AS original_to_update
     SET status = 'revisado',
         superseded_by_id = v_new_report_id,
         observacoes = CASE
           WHEN original_report.observacoes IS NULL OR original_report.observacoes = ''
             THEN 'Substituído pelo relatório ' || v_new_report_number
           ELSE original_report.observacoes || E'\n(Substituído pelo relatório ' || v_new_report_number || ')'
         END
   WHERE original_to_update.id = v_original_report_id
     AND original_to_update.organization_id = p_organization_id;

  RETURN QUERY SELECT v_new_report_id AS id, v_new_report_number AS numero_relatorio;
END;
$$;
