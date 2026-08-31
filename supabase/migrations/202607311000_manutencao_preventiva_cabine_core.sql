-- Base persistence for Manutencao Preventiva da Cabine Primaria.
-- Local migration draft only. Do not apply before review.

ALTER TABLE public.customer_sites
  ADD CONSTRAINT customer_sites_org_id_customer_id_uidx
  UNIQUE (organization_id, id, customer_id);

CREATE TABLE public.cabines_primarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL,
  site_id uuid NOT NULL,
  nome text NOT NULL,
  identificacao text,
  tipo text NOT NULL DEFAULT 'convencional',
  status text NOT NULL DEFAULT 'ativa',
  observacoes text,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cabines_primarias_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT cabines_primarias_nome_check
    CHECK (btrim(nome) <> ''),
  CONSTRAINT cabines_primarias_tipo_check
    CHECK (tipo IN ('convencional', 'simplificada')),
  CONSTRAINT cabines_primarias_status_check
    CHECK (status IN ('ativa', 'inativa')),
  CONSTRAINT cabines_primarias_customer_org_fkey
    FOREIGN KEY (organization_id, customer_id)
    REFERENCES public.customers (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT cabines_primarias_site_customer_org_fkey
    FOREIGN KEY (organization_id, site_id, customer_id)
    REFERENCES public.customer_sites (organization_id, id, customer_id)
    ON DELETE RESTRICT
);

CREATE TABLE public.cabine_equipamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  cabine_id uuid NOT NULL,
  tipo text NOT NULL,
  tag text NOT NULL,
  descricao text,
  fabricante text,
  numero_serie text,
  potencia_kva numeric,
  status text NOT NULL DEFAULT 'ativo',
  dados_tecnicos jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cabine_equipamentos_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT cabine_equipamentos_tag_check
    CHECK (btrim(tag) <> ''),
  CONSTRAINT cabine_equipamentos_tipo_check
    CHECK (tipo IN ('transformador')),
  CONSTRAINT cabine_equipamentos_status_check
    CHECK (status IN ('ativo', 'inativo')),
  CONSTRAINT cabine_equipamentos_potencia_check
    CHECK (potencia_kva IS NULL OR potencia_kva > 0),
  CONSTRAINT cabine_equipamentos_dados_tecnicos_object_check
    CHECK (jsonb_typeof(dados_tecnicos) = 'object'),
  CONSTRAINT cabine_equipamentos_cabine_org_fkey
    FOREIGN KEY (organization_id, cabine_id)
    REFERENCES public.cabines_primarias (organization_id, id)
    ON DELETE CASCADE
);

CREATE TABLE public.manutencoes_preventivas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  cabine_id uuid NOT NULL,
  ano_referencia integer NOT NULL CHECK (ano_referencia >= 2000 AND ano_referencia <= 9999),
  data_execucao date NOT NULL,
  responsavel_nome text,
  responsavel_crea text,
  status text NOT NULL DEFAULT 'rascunho',
  observacoes text,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT manutencoes_preventivas_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT manutencoes_preventivas_status_check
    CHECK (status IN ('rascunho', 'concluida', 'cancelada')),
  CONSTRAINT manutencoes_preventivas_cabine_org_fkey
    FOREIGN KEY (organization_id, cabine_id)
    REFERENCES public.cabines_primarias (organization_id, id)
    ON DELETE RESTRICT
);

CREATE TABLE public.manutencao_fichas_transformador (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  manutencao_id uuid NOT NULL,
  equipamento_id uuid NOT NULL,
  dados_ficha jsonb NOT NULL,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT manutencao_fichas_transformador_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT manutencao_fichas_transformador_dados_ficha_object_check
    CHECK (jsonb_typeof(dados_ficha) = 'object'),
  CONSTRAINT manutencao_fichas_transformador_manutencao_org_fkey
    FOREIGN KEY (organization_id, manutencao_id)
    REFERENCES public.manutencoes_preventivas (organization_id, id)
    ON DELETE CASCADE,
  CONSTRAINT manutencao_fichas_transformador_equipamento_org_fkey
    FOREIGN KEY (organization_id, equipamento_id)
    REFERENCES public.cabine_equipamentos (organization_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX cabines_primarias_org_site_idx
  ON public.cabines_primarias (organization_id, site_id);

CREATE INDEX cabines_primarias_org_customer_idx
  ON public.cabines_primarias (organization_id, customer_id);

CREATE INDEX cabine_equipamentos_org_cabine_idx
  ON public.cabine_equipamentos (organization_id, cabine_id);

CREATE INDEX manutencoes_preventivas_org_cabine_idx
  ON public.manutencoes_preventivas (organization_id, cabine_id, data_execucao DESC);

CREATE UNIQUE INDEX manutencao_fichas_transformador_org_manutencao_equipamento_uidx
  ON public.manutencao_fichas_transformador (organization_id, manutencao_id, equipamento_id);

CREATE INDEX manutencao_fichas_transformador_org_equipamento_idx
  ON public.manutencao_fichas_transformador (organization_id, equipamento_id);

CREATE OR REPLACE FUNCTION public.protect_created_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.created_by := auth.uid();
    END IF;

    RETURN NEW;
  END IF;

  NEW.created_by := OLD.created_by;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_cabine_equipamento_structure()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'A organizacao do equipamento da cabine nao pode ser alterada';
  END IF;

  IF NEW.cabine_id IS DISTINCT FROM OLD.cabine_id THEN
    RAISE EXCEPTION 'A cabine do equipamento nao pode ser alterada';
  END IF;

  IF NEW.tipo IS DISTINCT FROM OLD.tipo THEN
    RAISE EXCEPTION 'O tipo do equipamento nao pode ser alterado';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_manutencao_preventiva_structure()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'A organizacao da manutencao preventiva nao pode ser alterada';
  END IF;

  IF NEW.cabine_id IS DISTINCT FROM OLD.cabine_id THEN
    RAISE EXCEPTION 'A cabine da manutencao preventiva nao pode ser alterada';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_manutencao_ficha_transformador()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  maintenance public.manutencoes_preventivas%ROWTYPE;
  equipment public.cabine_equipamentos%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'A organizacao da ficha do transformador nao pode ser alterada';
    END IF;

    IF NEW.manutencao_id IS DISTINCT FROM OLD.manutencao_id THEN
      RAISE EXCEPTION 'A manutencao da ficha do transformador nao pode ser alterada';
    END IF;

    IF NEW.equipamento_id IS DISTINCT FROM OLD.equipamento_id THEN
      RAISE EXCEPTION 'O equipamento da ficha do transformador nao pode ser alterado';
    END IF;

    RETURN NEW;
  END IF;

  SELECT *
    INTO maintenance
    FROM public.manutencoes_preventivas
   WHERE organization_id = NEW.organization_id
     AND id = NEW.manutencao_id;

  IF maintenance.id IS NULL THEN
    RAISE EXCEPTION 'Manutencao preventiva nao encontrada para a organizacao informada';
  END IF;

  SELECT *
    INTO equipment
    FROM public.cabine_equipamentos
   WHERE organization_id = NEW.organization_id
     AND id = NEW.equipamento_id;

  IF equipment.id IS NULL THEN
    RAISE EXCEPTION 'Equipamento nao encontrado para a organizacao informada';
  END IF;

  IF equipment.tipo <> 'transformador' THEN
    RAISE EXCEPTION 'A ficha de transformador exige equipamento do tipo transformador';
  END IF;

  IF equipment.cabine_id <> maintenance.cabine_id THEN
    RAISE EXCEPTION 'Equipamento e manutencao preventiva devem pertencer a mesma cabine';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_cabines_primarias_created_by_trig
  BEFORE INSERT OR UPDATE ON public.cabines_primarias
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_created_by();

CREATE TRIGGER protect_cabine_equipamentos_created_by_trig
  BEFORE INSERT OR UPDATE ON public.cabine_equipamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_created_by();

CREATE TRIGGER protect_cabine_equipamento_structure_trig
  BEFORE UPDATE ON public.cabine_equipamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_cabine_equipamento_structure();

CREATE TRIGGER protect_manutencoes_preventivas_created_by_trig
  BEFORE INSERT OR UPDATE ON public.manutencoes_preventivas
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_created_by();

CREATE TRIGGER protect_manutencao_preventiva_structure_trig
  BEFORE UPDATE ON public.manutencoes_preventivas
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_manutencao_preventiva_structure();

CREATE TRIGGER protect_manutencao_fichas_transformador_created_by_trig
  BEFORE INSERT OR UPDATE ON public.manutencao_fichas_transformador
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_created_by();

CREATE TRIGGER validate_manutencao_ficha_transformador_trig
  BEFORE INSERT OR UPDATE ON public.manutencao_fichas_transformador
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_manutencao_ficha_transformador();

CREATE TRIGGER set_cabines_primarias_updated_at
  BEFORE UPDATE ON public.cabines_primarias
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_cabine_equipamentos_updated_at
  BEFORE UPDATE ON public.cabine_equipamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_manutencoes_preventivas_updated_at
  BEFORE UPDATE ON public.manutencoes_preventivas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_manutencao_fichas_transformador_updated_at
  BEFORE UPDATE ON public.manutencao_fichas_transformador
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.cabines_primarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cabine_equipamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manutencoes_preventivas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manutencao_fichas_transformador ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cabines_primarias FROM PUBLIC;
REVOKE ALL ON public.cabines_primarias FROM anon;
REVOKE ALL ON public.cabines_primarias FROM authenticated;
REVOKE ALL ON public.cabine_equipamentos FROM PUBLIC;
REVOKE ALL ON public.cabine_equipamentos FROM anon;
REVOKE ALL ON public.cabine_equipamentos FROM authenticated;
REVOKE ALL ON public.manutencoes_preventivas FROM PUBLIC;
REVOKE ALL ON public.manutencoes_preventivas FROM anon;
REVOKE ALL ON public.manutencoes_preventivas FROM authenticated;
REVOKE ALL ON public.manutencao_fichas_transformador FROM PUBLIC;
REVOKE ALL ON public.manutencao_fichas_transformador FROM anon;
REVOKE ALL ON public.manutencao_fichas_transformador FROM authenticated;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT ON public.cabines_primarias TO authenticated;
GRANT SELECT, INSERT ON public.cabine_equipamentos TO authenticated;
GRANT SELECT, INSERT ON public.manutencoes_preventivas TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.manutencao_fichas_transformador TO authenticated;

CREATE POLICY "cabines_primarias select by organization members"
ON public.cabines_primarias FOR SELECT TO authenticated
USING (public.is_organization_member(organization_id));

CREATE POLICY "cabines_primarias insert by organization members"
ON public.cabines_primarias FOR INSERT TO authenticated
WITH CHECK (
  public.is_organization_member(organization_id)
  AND created_by = auth.uid()
);

CREATE POLICY "cabine_equipamentos select by organization members"
ON public.cabine_equipamentos FOR SELECT TO authenticated
USING (public.is_organization_member(organization_id));

CREATE POLICY "cabine_equipamentos insert by organization members"
ON public.cabine_equipamentos FOR INSERT TO authenticated
WITH CHECK (
  public.is_organization_member(organization_id)
  AND created_by = auth.uid()
);

CREATE POLICY "manutencoes_preventivas select by organization members"
ON public.manutencoes_preventivas FOR SELECT TO authenticated
USING (public.is_organization_member(organization_id));

CREATE POLICY "manutencoes_preventivas insert by organization members"
ON public.manutencoes_preventivas FOR INSERT TO authenticated
WITH CHECK (
  public.is_organization_member(organization_id)
  AND created_by = auth.uid()
);

CREATE POLICY "manutencao_fichas_transformador select by organization members"
ON public.manutencao_fichas_transformador FOR SELECT TO authenticated
USING (public.is_organization_member(organization_id));

CREATE POLICY "manutencao_fichas_transformador insert by organization members"
ON public.manutencao_fichas_transformador FOR INSERT TO authenticated
WITH CHECK (
  public.is_organization_member(organization_id)
  AND created_by = auth.uid()
);

CREATE POLICY "manutencao_fichas_transformador update by organization members"
ON public.manutencao_fichas_transformador FOR UPDATE TO authenticated
USING (public.is_organization_member(organization_id))
WITH CHECK (public.is_organization_member(organization_id));
