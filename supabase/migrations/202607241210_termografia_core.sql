-- Termografia module, rebuilt on the MISFY organization model.
-- This migration is a local draft and must be reviewed before applying.

CREATE TABLE public.termografia_report_counters (
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  report_year integer NOT NULL CHECK (report_year >= 2000 AND report_year <= 9999),
  next_sequence integer NOT NULL DEFAULT 1 CHECK (next_sequence >= 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, report_year)
);

CREATE TABLE public.relatorios_termografia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  legacy_id uuid,
  numero_relatorio text NOT NULL,
  report_year integer NOT NULL CHECK (report_year >= 2000 AND report_year <= 9999),
  sequence_number integer NOT NULL CHECK (sequence_number >= 1),
  criado_em timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'gerado',

  customer_id uuid,
  site_id uuid,
  contact_id uuid,

  cliente_nome text NOT NULL,
  cliente_endereco text,
  cliente_cidade text,
  cliente_uf text,
  cliente_cep text,
  cliente_cnpj text,
  data_execucao date NOT NULL,
  objetivo text DEFAULT 'Estudo Termográfico da subestação primária e dos painéis elétricos',
  equipamento text DEFAULT 'Flir InfraCAM SD',
  responsavel_nome text DEFAULT 'Roberto Fontes Lopes',
  responsavel_crea text DEFAULT '0601049229',
  revisao integer NOT NULL DEFAULT 0,

  CONSTRAINT relatorios_termografia_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT relatorios_termografia_org_numero_uidx UNIQUE (organization_id, numero_relatorio),
  CONSTRAINT relatorios_termografia_org_year_sequence_uidx UNIQUE (organization_id, report_year, sequence_number),
  CONSTRAINT relatorios_termografia_status_check
    CHECK (status IN ('gerado', 'revisado', 'emitido', 'cancelado')),
  CONSTRAINT relatorios_termografia_customer_org_fkey
    FOREIGN KEY (organization_id, customer_id)
    REFERENCES public.customers (organization_id, id)
    ON DELETE SET NULL (customer_id),
  CONSTRAINT relatorios_termografia_site_org_fkey
    FOREIGN KEY (organization_id, site_id)
    REFERENCES public.customer_sites (organization_id, id)
    ON DELETE SET NULL (site_id),
  CONSTRAINT relatorios_termografia_contact_org_fkey
    FOREIGN KEY (organization_id, contact_id)
    REFERENCES public.customer_contacts (organization_id, id)
    ON DELETE SET NULL (contact_id)
);

CREATE TABLE public.termografia_pontos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  report_id uuid NOT NULL,
  ordem integer NOT NULL CHECK (ordem >= 1),
  setor text NOT NULL,
  local text NOT NULL,
  equipamento text,
  componente text,
  inspecionado boolean NOT NULL DEFAULT true,
  ocorrencia boolean NOT NULL DEFAULT false,
  temperatura text,
  data_hora_foto timestamptz,
  classificacao text,
  risco text,
  diagnostico text,
  recomendacao text,
  conclusao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,

  CONSTRAINT termografia_pontos_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT termografia_pontos_org_report_id_uidx UNIQUE (organization_id, report_id, id),
  CONSTRAINT termografia_pontos_report_ordem_uidx UNIQUE (organization_id, report_id, ordem),
  CONSTRAINT termografia_pontos_report_org_fkey
    FOREIGN KEY (organization_id, report_id)
    REFERENCES public.relatorios_termografia (organization_id, id)
    ON DELETE CASCADE,
  CONSTRAINT termografia_pontos_classificacao_check
    CHECK (classificacao IS NULL OR classificacao IN ('Normal', 'Observação', 'Intervenção Programada', 'Intervenção Imediata', 'Crítico')),
  CONSTRAINT termografia_pontos_risco_check
    CHECK (risco IS NULL OR risco IN ('Baixo', 'Médio', 'Alto'))
);

CREATE TABLE public.termografia_arquivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  report_id uuid NOT NULL,
  point_id uuid NOT NULL,
  tipo text NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  content_type text NOT NULL,
  tamanho_bytes bigint CHECK (tamanho_bytes IS NULL OR tamanho_bytes >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,

  CONSTRAINT termografia_arquivos_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT termografia_arquivos_storage_path_uidx UNIQUE (storage_path),
  CONSTRAINT termografia_arquivos_point_tipo_uidx UNIQUE (organization_id, point_id, tipo),
  CONSTRAINT termografia_arquivos_tipo_check CHECK (tipo IN ('digital', 'termica')),
  CONSTRAINT termografia_arquivos_file_name_check
    CHECK (
      file_name <> ''
      AND file_name <> '.'
      AND file_name <> '..'
      AND file_name NOT LIKE '%/%'
      AND file_name NOT LIKE '%\\%'
    ),
  CONSTRAINT termografia_arquivos_storage_path_check
    CHECK (storage_path = organization_id::text || '/' || report_id::text || '/' || point_id::text || '/' || file_name),
  CONSTRAINT termografia_arquivos_content_type_check CHECK (content_type LIKE 'image/%'),
  CONSTRAINT termografia_arquivos_report_org_fkey
    FOREIGN KEY (organization_id, report_id)
    REFERENCES public.relatorios_termografia (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT termografia_arquivos_point_report_org_fkey
    FOREIGN KEY (organization_id, report_id, point_id)
    REFERENCES public.termografia_pontos (organization_id, report_id, id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX relatorios_termografia_org_legacy_id_uidx
  ON public.relatorios_termografia (organization_id, legacy_id)
  WHERE legacy_id IS NOT NULL;

CREATE INDEX relatorios_termografia_org_criado_em_idx
  ON public.relatorios_termografia (organization_id, criado_em DESC);

CREATE INDEX relatorios_termografia_org_status_idx
  ON public.relatorios_termografia (organization_id, status);

CREATE INDEX termografia_pontos_org_report_idx
  ON public.termografia_pontos (organization_id, report_id, ordem);

CREATE INDEX termografia_arquivos_org_point_idx
  ON public.termografia_arquivos (organization_id, point_id);

CREATE OR REPLACE FUNCTION public.set_termografia_report_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  generated_sequence integer;
BEGIN
  NEW.report_year := EXTRACT(YEAR FROM COALESCE(NEW.data_execucao, now()))::integer;

  INSERT INTO public.termografia_report_counters AS counter (
    organization_id,
    report_year,
    next_sequence
  )
  VALUES (
    NEW.organization_id,
    NEW.report_year,
    2
  )
  ON CONFLICT (organization_id, report_year)
  DO UPDATE SET
    next_sequence = counter.next_sequence + 1,
    updated_at = now()
  RETURNING counter.next_sequence - 1
    INTO generated_sequence;

  NEW.sequence_number := generated_sequence;
  NEW.numero_relatorio := 'RT-' || NEW.report_year || '-' || lpad(generated_sequence::text, 3, '0');

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_termografia_report_number() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.protect_relatorios_termografia_numbering()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.organization_id IS DISTINCT FROM NEW.organization_id
     OR OLD.report_year IS DISTINCT FROM NEW.report_year
     OR OLD.sequence_number IS DISTINCT FROM NEW.sequence_number
     OR OLD.numero_relatorio IS DISTINCT FROM NEW.numero_relatorio THEN
    RAISE EXCEPTION 'Campos de numeracao e organizacao do relatorio de Termografia sao imutaveis';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_relatorios_termografia_numbering() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.protect_termografia_pontos_structural_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.organization_id IS DISTINCT FROM NEW.organization_id
     OR OLD.report_id IS DISTINCT FROM NEW.report_id THEN
    RAISE EXCEPTION 'Chaves estruturais do ponto de Termografia sao imutaveis';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_termografia_pontos_structural_fields() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.protect_termografia_arquivos_structural_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.organization_id IS DISTINCT FROM NEW.organization_id
     OR OLD.report_id IS DISTINCT FROM NEW.report_id
     OR OLD.point_id IS DISTINCT FROM NEW.point_id
     OR OLD.storage_path IS DISTINCT FROM NEW.storage_path
     OR OLD.tipo IS DISTINCT FROM NEW.tipo THEN
    RAISE EXCEPTION 'Chaves estruturais do arquivo de Termografia sao imutaveis';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_termografia_arquivos_structural_fields() FROM PUBLIC;

CREATE TRIGGER set_termografia_report_number_trig
  BEFORE INSERT ON public.relatorios_termografia
  FOR EACH ROW
  EXECUTE FUNCTION public.set_termografia_report_number();

CREATE TRIGGER protect_relatorios_termografia_numbering_trig
  BEFORE UPDATE ON public.relatorios_termografia
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_relatorios_termografia_numbering();

CREATE TRIGGER protect_termografia_pontos_structural_fields_trig
  BEFORE UPDATE ON public.termografia_pontos
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_termografia_pontos_structural_fields();

CREATE TRIGGER protect_termografia_arquivos_structural_fields_trig
  BEFORE UPDATE ON public.termografia_arquivos
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_termografia_arquivos_structural_fields();

CREATE TRIGGER set_relatorios_termografia_updated_at
  BEFORE UPDATE ON public.relatorios_termografia
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_termografia_pontos_updated_at
  BEFORE UPDATE ON public.termografia_pontos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.termografia_report_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relatorios_termografia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.termografia_pontos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.termografia_arquivos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.relatorios_termografia, public.termografia_pontos, public.termografia_arquivos, public.termografia_report_counters FROM PUBLIC;
REVOKE ALL ON public.relatorios_termografia, public.termografia_pontos, public.termografia_arquivos, public.termografia_report_counters FROM anon;
REVOKE ALL ON public.relatorios_termografia, public.termografia_pontos, public.termografia_arquivos, public.termografia_report_counters FROM authenticated;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.relatorios_termografia, public.termografia_pontos, public.termografia_arquivos TO authenticated;

CREATE POLICY "relatorios_termografia select by organization members"
ON public.relatorios_termografia FOR SELECT TO authenticated
USING (public.is_organization_member(organization_id));

CREATE POLICY "relatorios_termografia insert by organization members"
ON public.relatorios_termografia FOR INSERT TO authenticated
WITH CHECK (public.is_organization_member(organization_id));

CREATE POLICY "relatorios_termografia update by organization members"
ON public.relatorios_termografia FOR UPDATE TO authenticated
USING (public.is_organization_member(organization_id))
WITH CHECK (public.is_organization_member(organization_id));

CREATE POLICY "relatorios_termografia delete by organization members"
ON public.relatorios_termografia FOR DELETE TO authenticated
USING (public.is_organization_member(organization_id));

CREATE POLICY "termografia_pontos select by organization members"
ON public.termografia_pontos FOR SELECT TO authenticated
USING (public.is_organization_member(organization_id));

CREATE POLICY "termografia_pontos insert by organization members"
ON public.termografia_pontos FOR INSERT TO authenticated
WITH CHECK (public.is_organization_member(organization_id));

CREATE POLICY "termografia_pontos update by organization members"
ON public.termografia_pontos FOR UPDATE TO authenticated
USING (public.is_organization_member(organization_id))
WITH CHECK (public.is_organization_member(organization_id));

CREATE POLICY "termografia_pontos delete by organization members"
ON public.termografia_pontos FOR DELETE TO authenticated
USING (public.is_organization_member(organization_id));

CREATE POLICY "termografia_arquivos select by organization members"
ON public.termografia_arquivos FOR SELECT TO authenticated
USING (public.is_organization_member(organization_id));

CREATE POLICY "termografia_arquivos insert by organization members"
ON public.termografia_arquivos FOR INSERT TO authenticated
WITH CHECK (public.is_organization_member(organization_id));

CREATE POLICY "termografia_arquivos update by organization members"
ON public.termografia_arquivos FOR UPDATE TO authenticated
USING (public.is_organization_member(organization_id))
WITH CHECK (public.is_organization_member(organization_id));

CREATE POLICY "termografia_arquivos delete by organization members"
ON public.termografia_arquivos FOR DELETE TO authenticated
USING (public.is_organization_member(organization_id));
