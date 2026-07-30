-- Transformador reports module foundation on the MISFY organization model.
-- Local migration draft only. Do not apply before review.

CREATE TABLE public.transformador_report_counters (
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  report_month integer NOT NULL CHECK (report_month >= 200001 AND report_month <= 999912),
  next_sequence integer NOT NULL DEFAULT 1 CHECK (next_sequence >= 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, report_month)
);

CREATE TABLE public.relatorios_transformador (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  numero_relatorio text NOT NULL,
  report_month integer NOT NULL CHECK (report_month >= 200001 AND report_month <= 999912),
  sequence_number integer NOT NULL CHECK (sequence_number >= 1),
  criado_por uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'gerado',

  revised_from_id uuid,
  superseded_by_id uuid,

  cliente_nome text NOT NULL,
  cliente_endereco text NOT NULL,
  cliente_cidade text NOT NULL,
  cliente_uf text NOT NULL,
  cliente_cnpj text,
  cliente_ie text,
  observacoes text,

  fabricante text,
  numero_serie text,
  potencia_kva numeric NOT NULL CHECK (potencia_kva > 0),
  tensao_at_nominal integer NOT NULL CHECK (tensao_at_nominal > 0),
  tensao_bt text NOT NULL,
  tensao_bt_label text NOT NULL,
  resfriamento text DEFAULT 'LN',
  grupo_ligacao text DEFAULT 'Subtrativa',
  tipo_oleo text DEFAULT 'Mineral',
  procedencia_oleo text DEFAULT 'BR',
  tap_despacho integer NOT NULL,
  taps integer[] NOT NULL,

  responsavel_nome text DEFAULT 'Roberto Fontes Lopes',
  responsavel_crea text DEFAULT 'CREA 060.104.922.9',
  data_relatorio date NOT NULL,
  temperatura_c numeric DEFAULT 26,
  umidade_relativa numeric CHECK (umidade_relativa IS NULL OR (umidade_relativa >= 0 AND umidade_relativa <= 100)),

  valores_calculados jsonb NOT NULL,

  CONSTRAINT relatorios_transformador_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT relatorios_transformador_org_numero_uidx UNIQUE (organization_id, numero_relatorio),
  CONSTRAINT relatorios_transformador_org_month_sequence_uidx UNIQUE (organization_id, report_month, sequence_number),
  CONSTRAINT relatorios_transformador_status_check
    CHECK (status IN ('gerado', 'revisado', 'emitido', 'cancelado')),
  CONSTRAINT relatorios_transformador_tensao_bt_check
    CHECK (tensao_bt IN ('220', '380', '440')),
  CONSTRAINT relatorios_transformador_cliente_uf_check
    CHECK (char_length(cliente_uf) = 2),
  CONSTRAINT relatorios_transformador_taps_check
    CHECK (cardinality(taps) > 0),
  CONSTRAINT relatorios_transformador_tap_despacho_check
    CHECK (tap_despacho = ANY (taps)),
  CONSTRAINT relatorios_transformador_revised_from_org_fkey
    FOREIGN KEY (organization_id, revised_from_id)
    REFERENCES public.relatorios_transformador (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT relatorios_transformador_superseded_by_org_fkey
    FOREIGN KEY (organization_id, superseded_by_id)
    REFERENCES public.relatorios_transformador (organization_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX relatorios_transformador_org_criado_em_idx
  ON public.relatorios_transformador (organization_id, criado_em DESC);

CREATE INDEX relatorios_transformador_org_status_idx
  ON public.relatorios_transformador (organization_id, status);

CREATE INDEX relatorios_transformador_org_data_relatorio_idx
  ON public.relatorios_transformador (organization_id, data_relatorio DESC);

CREATE INDEX relatorios_transformador_org_revised_from_idx
  ON public.relatorios_transformador (organization_id, revised_from_id)
  WHERE revised_from_id IS NOT NULL;

CREATE INDEX relatorios_transformador_org_superseded_by_idx
  ON public.relatorios_transformador (organization_id, superseded_by_id)
  WHERE superseded_by_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_transformador_report_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  generated_sequence integer;
BEGIN
  NEW.report_month := to_char(COALESCE(NEW.data_relatorio, now()::date), 'YYYYMM')::integer;

  INSERT INTO public.transformador_report_counters AS counter (
    organization_id,
    report_month,
    next_sequence
  )
  VALUES (
    NEW.organization_id,
    NEW.report_month,
    2
  )
  ON CONFLICT (organization_id, report_month)
  DO UPDATE SET
    next_sequence = counter.next_sequence + 1,
    updated_at = now()
  RETURNING counter.next_sequence - 1
    INTO generated_sequence;

  NEW.sequence_number := generated_sequence;
  NEW.numero_relatorio := 'RT-' || NEW.report_month || '-' || lpad(generated_sequence::text, 3, '0');

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_transformador_report_number() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.protect_relatorios_transformador_numbering()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (NEW.revised_from_id IS NOT NULL OR NEW.superseded_by_id IS NOT NULL)
       AND current_setting('app.transformador_revision_rpc', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Vinculos de revisao do relatorio de Transformador so podem ser definidos pela RPC de revisao';
    END IF;

    IF NEW.status IS DISTINCT FROM 'gerado' THEN
      RAISE EXCEPTION 'Relatorios de Transformador devem ser criados com status gerado';
    END IF;

    RETURN NEW;
  END IF;

  IF OLD.organization_id IS DISTINCT FROM NEW.organization_id
     OR OLD.report_month IS DISTINCT FROM NEW.report_month
     OR OLD.sequence_number IS DISTINCT FROM NEW.sequence_number
     OR OLD.numero_relatorio IS DISTINCT FROM NEW.numero_relatorio THEN
    RAISE EXCEPTION 'Campos de numeracao e organizacao do relatorio de Transformador sao imutaveis';
  END IF;

  IF (OLD.revised_from_id IS DISTINCT FROM NEW.revised_from_id
      OR OLD.superseded_by_id IS DISTINCT FROM NEW.superseded_by_id)
     AND current_setting('app.transformador_revision_rpc', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Vinculos de revisao do relatorio de Transformador so podem ser alterados pela RPC de revisao';
  END IF;

  IF OLD.status IN ('revisado', 'cancelado')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    RAISE EXCEPTION 'Relatorios de Transformador revisados ou cancelados nao podem voltar de status';
  END IF;

  IF NEW.status = 'revisado'
     AND current_setting('app.transformador_revision_rpc', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Somente a RPC de revisao pode marcar relatorio de Transformador como revisado';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_relatorios_transformador_numbering() FROM PUBLIC;

CREATE TRIGGER set_transformador_report_number_trig
  BEFORE INSERT ON public.relatorios_transformador
  FOR EACH ROW
  EXECUTE FUNCTION public.set_transformador_report_number();

CREATE TRIGGER protect_relatorios_transformador_numbering_trig
  BEFORE INSERT OR UPDATE ON public.relatorios_transformador
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_relatorios_transformador_numbering();

CREATE TRIGGER set_relatorios_transformador_updated_at
  BEFORE UPDATE ON public.relatorios_transformador
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

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
  new_report record;
  report_taps integer[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario autenticado obrigatorio para revisar relatorio de Transformador';
  END IF;

  IF NOT public.is_organization_member(p_organization_id) THEN
    RAISE EXCEPTION 'Usuario nao pertence a organizacao informada';
  END IF;

  SELECT *
    INTO original_report
    FROM public.relatorios_transformador
   WHERE id = p_original_id
   FOR UPDATE;

  IF original_report.id IS NULL THEN
    RAISE EXCEPTION 'Relatorio original nao encontrado';
  END IF;

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

  INSERT INTO public.relatorios_transformador (
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
    p_original_id,
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
  RETURNING relatorios_transformador.id, relatorios_transformador.numero_relatorio
    INTO new_report;

  UPDATE public.relatorios_transformador
     SET status = 'revisado',
         superseded_by_id = new_report.id,
         observacoes = CASE
           WHEN original_report.observacoes IS NULL OR original_report.observacoes = ''
             THEN 'Substituído pelo relatório ' || new_report.numero_relatorio
           ELSE original_report.observacoes || E'\n(Substituído pelo relatório ' || new_report.numero_relatorio || ')'
         END
   WHERE id = p_original_id
     AND organization_id = p_organization_id;

  RETURN QUERY SELECT new_report.id, new_report.numero_relatorio;
END;
$$;

REVOKE ALL ON FUNCTION public.create_transformador_revision(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_transformador_revision(uuid, uuid, jsonb) TO authenticated;

ALTER TABLE public.transformador_report_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relatorios_transformador ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.relatorios_transformador, public.transformador_report_counters FROM PUBLIC;
REVOKE ALL ON public.relatorios_transformador, public.transformador_report_counters FROM anon;
REVOKE ALL ON public.relatorios_transformador, public.transformador_report_counters FROM authenticated;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.relatorios_transformador TO authenticated;
GRANT UPDATE (
  status,
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
  valores_calculados
) ON public.relatorios_transformador TO authenticated;

CREATE POLICY "relatorios_transformador select by organization members"
ON public.relatorios_transformador FOR SELECT TO authenticated
USING (public.is_organization_member(organization_id));

CREATE POLICY "relatorios_transformador insert by organization members"
ON public.relatorios_transformador FOR INSERT TO authenticated
WITH CHECK (public.is_organization_member(organization_id));

CREATE POLICY "relatorios_transformador update by organization members"
ON public.relatorios_transformador FOR UPDATE TO authenticated
USING (public.is_organization_member(organization_id))
WITH CHECK (public.is_organization_member(organization_id));

CREATE POLICY "relatorios_transformador delete canceled unlinked by organization members"
ON public.relatorios_transformador FOR DELETE TO authenticated
USING (
  public.is_organization_member(organization_id)
  AND status = 'cancelado'
  AND revised_from_id IS NULL
  AND superseded_by_id IS NULL
);
