-- Local migration draft for Manutencao Preventiva - fichas complementares.
-- Do not apply before technical review and manual authorization.

ALTER TABLE public.cabine_equipamentos
  DROP CONSTRAINT cabine_equipamentos_tipo_check,
  ADD CONSTRAINT cabine_equipamentos_tipo_check
    CHECK (tipo IN ('transformador', 'disjuntor_15kv', 'chave_seccionadora', 'para_raios', 'tc_tp', 'cabo_media_tensao', 'aterramento'));

CREATE TABLE public.manutencao_fichas_chave_seccionadora (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  manutencao_id uuid NOT NULL,
  equipamento_id uuid NOT NULL,
  dados_ficha jsonb NOT NULL,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manutencao_fichas_chave_seccionadora_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT manutencao_fichas_chave_seccionadora_dados_ficha_object_check CHECK (jsonb_typeof(dados_ficha) = 'object'),
  CONSTRAINT manutencao_fichas_chave_seccionadora_manutencao_org_fkey FOREIGN KEY (organization_id, manutencao_id) REFERENCES public.manutencoes_preventivas (organization_id, id) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT manutencao_fichas_chave_seccionadora_equipamento_org_fkey FOREIGN KEY (organization_id, equipamento_id) REFERENCES public.cabine_equipamentos (organization_id, id) ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE public.manutencao_fichas_para_raios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  manutencao_id uuid NOT NULL,
  equipamento_id uuid NOT NULL,
  dados_ficha jsonb NOT NULL,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manutencao_fichas_para_raios_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT manutencao_fichas_para_raios_dados_ficha_object_check CHECK (jsonb_typeof(dados_ficha) = 'object'),
  CONSTRAINT manutencao_fichas_para_raios_manutencao_org_fkey FOREIGN KEY (organization_id, manutencao_id) REFERENCES public.manutencoes_preventivas (organization_id, id) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT manutencao_fichas_para_raios_equipamento_org_fkey FOREIGN KEY (organization_id, equipamento_id) REFERENCES public.cabine_equipamentos (organization_id, id) ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE public.manutencao_fichas_tc_tp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  manutencao_id uuid NOT NULL,
  equipamento_id uuid NOT NULL,
  dados_ficha jsonb NOT NULL,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manutencao_fichas_tc_tp_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT manutencao_fichas_tc_tp_dados_ficha_object_check CHECK (jsonb_typeof(dados_ficha) = 'object'),
  CONSTRAINT manutencao_fichas_tc_tp_manutencao_org_fkey FOREIGN KEY (organization_id, manutencao_id) REFERENCES public.manutencoes_preventivas (organization_id, id) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT manutencao_fichas_tc_tp_equipamento_org_fkey FOREIGN KEY (organization_id, equipamento_id) REFERENCES public.cabine_equipamentos (organization_id, id) ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE public.manutencao_fichas_cabos_media_tensao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  manutencao_id uuid NOT NULL,
  equipamento_id uuid NOT NULL,
  dados_ficha jsonb NOT NULL,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manutencao_fichas_cabos_media_tensao_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT manutencao_fichas_cabos_media_tensao_dados_ficha_object_check CHECK (jsonb_typeof(dados_ficha) = 'object'),
  CONSTRAINT manutencao_fichas_cabos_media_tensao_manutencao_org_fkey FOREIGN KEY (organization_id, manutencao_id) REFERENCES public.manutencoes_preventivas (organization_id, id) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT manutencao_fichas_cabos_media_tensao_equipamento_org_fkey FOREIGN KEY (organization_id, equipamento_id) REFERENCES public.cabine_equipamentos (organization_id, id) ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE public.manutencao_fichas_aterramento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  manutencao_id uuid NOT NULL,
  equipamento_id uuid NOT NULL,
  dados_ficha jsonb NOT NULL,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manutencao_fichas_aterramento_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT manutencao_fichas_aterramento_dados_ficha_object_check CHECK (jsonb_typeof(dados_ficha) = 'object'),
  CONSTRAINT manutencao_fichas_aterramento_manutencao_org_fkey FOREIGN KEY (organization_id, manutencao_id) REFERENCES public.manutencoes_preventivas (organization_id, id) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT manutencao_fichas_aterramento_equipamento_org_fkey FOREIGN KEY (organization_id, equipamento_id) REFERENCES public.cabine_equipamentos (organization_id, id) ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX manutencao_fichas_chave_seccionadora_org_manutencao_equipamento_uidx ON public.manutencao_fichas_chave_seccionadora (organization_id, manutencao_id, equipamento_id);
CREATE INDEX manutencao_fichas_chave_seccionadora_org_equipamento_idx ON public.manutencao_fichas_chave_seccionadora (organization_id, equipamento_id);
CREATE UNIQUE INDEX manutencao_fichas_para_raios_org_manutencao_equipamento_uidx ON public.manutencao_fichas_para_raios (organization_id, manutencao_id, equipamento_id);
CREATE INDEX manutencao_fichas_para_raios_org_equipamento_idx ON public.manutencao_fichas_para_raios (organization_id, equipamento_id);
CREATE UNIQUE INDEX manutencao_fichas_tc_tp_org_manutencao_equipamento_uidx ON public.manutencao_fichas_tc_tp (organization_id, manutencao_id, equipamento_id);
CREATE INDEX manutencao_fichas_tc_tp_org_equipamento_idx ON public.manutencao_fichas_tc_tp (organization_id, equipamento_id);
CREATE UNIQUE INDEX manutencao_fichas_cabos_media_tensao_org_manutencao_equipamento_uidx ON public.manutencao_fichas_cabos_media_tensao (organization_id, manutencao_id, equipamento_id);
CREATE INDEX manutencao_fichas_cabos_media_tensao_org_equipamento_idx ON public.manutencao_fichas_cabos_media_tensao (organization_id, equipamento_id);
CREATE UNIQUE INDEX manutencao_fichas_aterramento_org_manutencao_equipamento_uidx ON public.manutencao_fichas_aterramento (organization_id, manutencao_id, equipamento_id);
CREATE INDEX manutencao_fichas_aterramento_org_equipamento_idx ON public.manutencao_fichas_aterramento (organization_id, equipamento_id);

CREATE OR REPLACE FUNCTION public.validate_manutencao_ficha_chave_seccionadora()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  maintenance public.manutencoes_preventivas%ROWTYPE;
  equipment public.cabine_equipamentos%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN RAISE EXCEPTION 'A organizacao da ficha de chave seccionadora nao pode ser alterada'; END IF;
    IF NEW.manutencao_id IS DISTINCT FROM OLD.manutencao_id THEN RAISE EXCEPTION 'A manutencao da ficha de chave seccionadora nao pode ser alterada'; END IF;
    IF NEW.equipamento_id IS DISTINCT FROM OLD.equipamento_id THEN RAISE EXCEPTION 'O equipamento da ficha de chave seccionadora nao pode ser alterado'; END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO maintenance FROM public.manutencoes_preventivas WHERE organization_id = NEW.organization_id AND id = NEW.manutencao_id;
  IF maintenance.id IS NULL THEN RAISE EXCEPTION 'Manutencao preventiva nao encontrada para a organizacao informada'; END IF;
  SELECT * INTO equipment FROM public.cabine_equipamentos WHERE organization_id = NEW.organization_id AND id = NEW.equipamento_id;
  IF equipment.id IS NULL THEN RAISE EXCEPTION 'Equipamento nao encontrado para a organizacao informada'; END IF;
  IF equipment.tipo <> 'chave_seccionadora' THEN RAISE EXCEPTION 'A ficha de chave seccionadora exige equipamento do tipo chave_seccionadora'; END IF;
  IF equipment.cabine_id <> maintenance.cabine_id THEN RAISE EXCEPTION 'Equipamento e manutencao preventiva devem pertencer a mesma cabine'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_manutencao_ficha_para_raios()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  maintenance public.manutencoes_preventivas%ROWTYPE;
  equipment public.cabine_equipamentos%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN RAISE EXCEPTION 'A organizacao da ficha de para-raios nao pode ser alterada'; END IF;
    IF NEW.manutencao_id IS DISTINCT FROM OLD.manutencao_id THEN RAISE EXCEPTION 'A manutencao da ficha de para-raios nao pode ser alterada'; END IF;
    IF NEW.equipamento_id IS DISTINCT FROM OLD.equipamento_id THEN RAISE EXCEPTION 'O equipamento da ficha de para-raios nao pode ser alterado'; END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO maintenance FROM public.manutencoes_preventivas WHERE organization_id = NEW.organization_id AND id = NEW.manutencao_id;
  IF maintenance.id IS NULL THEN RAISE EXCEPTION 'Manutencao preventiva nao encontrada para a organizacao informada'; END IF;
  SELECT * INTO equipment FROM public.cabine_equipamentos WHERE organization_id = NEW.organization_id AND id = NEW.equipamento_id;
  IF equipment.id IS NULL THEN RAISE EXCEPTION 'Equipamento nao encontrado para a organizacao informada'; END IF;
  IF equipment.tipo <> 'para_raios' THEN RAISE EXCEPTION 'A ficha de para-raios exige equipamento do tipo para_raios'; END IF;
  IF equipment.cabine_id <> maintenance.cabine_id THEN RAISE EXCEPTION 'Equipamento e manutencao preventiva devem pertencer a mesma cabine'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_manutencao_ficha_tc_tp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  maintenance public.manutencoes_preventivas%ROWTYPE;
  equipment public.cabine_equipamentos%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN RAISE EXCEPTION 'A organizacao da ficha de TC/TP nao pode ser alterada'; END IF;
    IF NEW.manutencao_id IS DISTINCT FROM OLD.manutencao_id THEN RAISE EXCEPTION 'A manutencao da ficha de TC/TP nao pode ser alterada'; END IF;
    IF NEW.equipamento_id IS DISTINCT FROM OLD.equipamento_id THEN RAISE EXCEPTION 'O equipamento da ficha de TC/TP nao pode ser alterado'; END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO maintenance FROM public.manutencoes_preventivas WHERE organization_id = NEW.organization_id AND id = NEW.manutencao_id;
  IF maintenance.id IS NULL THEN RAISE EXCEPTION 'Manutencao preventiva nao encontrada para a organizacao informada'; END IF;
  SELECT * INTO equipment FROM public.cabine_equipamentos WHERE organization_id = NEW.organization_id AND id = NEW.equipamento_id;
  IF equipment.id IS NULL THEN RAISE EXCEPTION 'Equipamento nao encontrado para a organizacao informada'; END IF;
  IF equipment.tipo <> 'tc_tp' THEN RAISE EXCEPTION 'A ficha de TC/TP exige equipamento do tipo tc_tp'; END IF;
  IF equipment.cabine_id <> maintenance.cabine_id THEN RAISE EXCEPTION 'Equipamento e manutencao preventiva devem pertencer a mesma cabine'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_manutencao_ficha_cabos_media_tensao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  maintenance public.manutencoes_preventivas%ROWTYPE;
  equipment public.cabine_equipamentos%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN RAISE EXCEPTION 'A organizacao da ficha de cabos de media tensao nao pode ser alterada'; END IF;
    IF NEW.manutencao_id IS DISTINCT FROM OLD.manutencao_id THEN RAISE EXCEPTION 'A manutencao da ficha de cabos de media tensao nao pode ser alterada'; END IF;
    IF NEW.equipamento_id IS DISTINCT FROM OLD.equipamento_id THEN RAISE EXCEPTION 'O equipamento da ficha de cabos de media tensao nao pode ser alterado'; END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO maintenance FROM public.manutencoes_preventivas WHERE organization_id = NEW.organization_id AND id = NEW.manutencao_id;
  IF maintenance.id IS NULL THEN RAISE EXCEPTION 'Manutencao preventiva nao encontrada para a organizacao informada'; END IF;
  SELECT * INTO equipment FROM public.cabine_equipamentos WHERE organization_id = NEW.organization_id AND id = NEW.equipamento_id;
  IF equipment.id IS NULL THEN RAISE EXCEPTION 'Equipamento nao encontrado para a organizacao informada'; END IF;
  IF equipment.tipo <> 'cabo_media_tensao' THEN RAISE EXCEPTION 'A ficha de cabos de media tensao exige equipamento do tipo cabo_media_tensao'; END IF;
  IF equipment.cabine_id <> maintenance.cabine_id THEN RAISE EXCEPTION 'Equipamento e manutencao preventiva devem pertencer a mesma cabine'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_manutencao_ficha_aterramento()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  maintenance public.manutencoes_preventivas%ROWTYPE;
  equipment public.cabine_equipamentos%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN RAISE EXCEPTION 'A organizacao da ficha de aterramento nao pode ser alterada'; END IF;
    IF NEW.manutencao_id IS DISTINCT FROM OLD.manutencao_id THEN RAISE EXCEPTION 'A manutencao da ficha de aterramento nao pode ser alterada'; END IF;
    IF NEW.equipamento_id IS DISTINCT FROM OLD.equipamento_id THEN RAISE EXCEPTION 'O equipamento da ficha de aterramento nao pode ser alterado'; END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO maintenance FROM public.manutencoes_preventivas WHERE organization_id = NEW.organization_id AND id = NEW.manutencao_id;
  IF maintenance.id IS NULL THEN RAISE EXCEPTION 'Manutencao preventiva nao encontrada para a organizacao informada'; END IF;
  SELECT * INTO equipment FROM public.cabine_equipamentos WHERE organization_id = NEW.organization_id AND id = NEW.equipamento_id;
  IF equipment.id IS NULL THEN RAISE EXCEPTION 'Equipamento nao encontrado para a organizacao informada'; END IF;
  IF equipment.tipo <> 'aterramento' THEN RAISE EXCEPTION 'A ficha de aterramento exige equipamento do tipo aterramento'; END IF;
  IF equipment.cabine_id <> maintenance.cabine_id THEN RAISE EXCEPTION 'Equipamento e manutencao preventiva devem pertencer a mesma cabine'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_manutencao_fichas_chave_seccionadora_created_by_trig BEFORE INSERT OR UPDATE ON public.manutencao_fichas_chave_seccionadora FOR EACH ROW EXECUTE FUNCTION public.protect_created_by();
CREATE TRIGGER validate_manutencao_fichas_chave_seccionadora_trig BEFORE INSERT OR UPDATE ON public.manutencao_fichas_chave_seccionadora FOR EACH ROW EXECUTE FUNCTION public.validate_manutencao_ficha_chave_seccionadora();
CREATE TRIGGER set_manutencao_fichas_chave_seccionadora_updated_at BEFORE UPDATE ON public.manutencao_fichas_chave_seccionadora FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER protect_manutencao_fichas_para_raios_created_by_trig BEFORE INSERT OR UPDATE ON public.manutencao_fichas_para_raios FOR EACH ROW EXECUTE FUNCTION public.protect_created_by();
CREATE TRIGGER validate_manutencao_fichas_para_raios_trig BEFORE INSERT OR UPDATE ON public.manutencao_fichas_para_raios FOR EACH ROW EXECUTE FUNCTION public.validate_manutencao_ficha_para_raios();
CREATE TRIGGER set_manutencao_fichas_para_raios_updated_at BEFORE UPDATE ON public.manutencao_fichas_para_raios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER protect_manutencao_fichas_tc_tp_created_by_trig BEFORE INSERT OR UPDATE ON public.manutencao_fichas_tc_tp FOR EACH ROW EXECUTE FUNCTION public.protect_created_by();
CREATE TRIGGER validate_manutencao_fichas_tc_tp_trig BEFORE INSERT OR UPDATE ON public.manutencao_fichas_tc_tp FOR EACH ROW EXECUTE FUNCTION public.validate_manutencao_ficha_tc_tp();
CREATE TRIGGER set_manutencao_fichas_tc_tp_updated_at BEFORE UPDATE ON public.manutencao_fichas_tc_tp FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER protect_manutencao_fichas_cabos_media_tensao_created_by_trig BEFORE INSERT OR UPDATE ON public.manutencao_fichas_cabos_media_tensao FOR EACH ROW EXECUTE FUNCTION public.protect_created_by();
CREATE TRIGGER validate_manutencao_fichas_cabos_media_tensao_trig BEFORE INSERT OR UPDATE ON public.manutencao_fichas_cabos_media_tensao FOR EACH ROW EXECUTE FUNCTION public.validate_manutencao_ficha_cabos_media_tensao();
CREATE TRIGGER set_manutencao_fichas_cabos_media_tensao_updated_at BEFORE UPDATE ON public.manutencao_fichas_cabos_media_tensao FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER protect_manutencao_fichas_aterramento_created_by_trig BEFORE INSERT OR UPDATE ON public.manutencao_fichas_aterramento FOR EACH ROW EXECUTE FUNCTION public.protect_created_by();
CREATE TRIGGER validate_manutencao_fichas_aterramento_trig BEFORE INSERT OR UPDATE ON public.manutencao_fichas_aterramento FOR EACH ROW EXECUTE FUNCTION public.validate_manutencao_ficha_aterramento();
CREATE TRIGGER set_manutencao_fichas_aterramento_updated_at BEFORE UPDATE ON public.manutencao_fichas_aterramento FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.manutencao_fichas_chave_seccionadora ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manutencao_fichas_para_raios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manutencao_fichas_tc_tp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manutencao_fichas_cabos_media_tensao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manutencao_fichas_aterramento ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.manutencao_fichas_chave_seccionadora FROM PUBLIC;
REVOKE ALL ON public.manutencao_fichas_chave_seccionadora FROM anon;
REVOKE ALL ON public.manutencao_fichas_chave_seccionadora FROM authenticated;
REVOKE ALL ON public.manutencao_fichas_para_raios FROM PUBLIC;
REVOKE ALL ON public.manutencao_fichas_para_raios FROM anon;
REVOKE ALL ON public.manutencao_fichas_para_raios FROM authenticated;
REVOKE ALL ON public.manutencao_fichas_tc_tp FROM PUBLIC;
REVOKE ALL ON public.manutencao_fichas_tc_tp FROM anon;
REVOKE ALL ON public.manutencao_fichas_tc_tp FROM authenticated;
REVOKE ALL ON public.manutencao_fichas_cabos_media_tensao FROM PUBLIC;
REVOKE ALL ON public.manutencao_fichas_cabos_media_tensao FROM anon;
REVOKE ALL ON public.manutencao_fichas_cabos_media_tensao FROM authenticated;
REVOKE ALL ON public.manutencao_fichas_aterramento FROM PUBLIC;
REVOKE ALL ON public.manutencao_fichas_aterramento FROM anon;
REVOKE ALL ON public.manutencao_fichas_aterramento FROM authenticated;

GRANT SELECT, INSERT, UPDATE ON public.manutencao_fichas_chave_seccionadora TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.manutencao_fichas_para_raios TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.manutencao_fichas_tc_tp TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.manutencao_fichas_cabos_media_tensao TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.manutencao_fichas_aterramento TO authenticated;

CREATE POLICY "manutencao_fichas_chave_seccionadora select by organization members" ON public.manutencao_fichas_chave_seccionadora FOR SELECT TO authenticated USING (public.is_organization_member(organization_id));
CREATE POLICY "manutencao_fichas_chave_seccionadora insert by organization members" ON public.manutencao_fichas_chave_seccionadora FOR INSERT TO authenticated WITH CHECK (public.is_organization_member(organization_id) AND created_by = auth.uid());
CREATE POLICY "manutencao_fichas_chave_seccionadora update by organization members" ON public.manutencao_fichas_chave_seccionadora FOR UPDATE TO authenticated USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY "manutencao_fichas_para_raios select by organization members" ON public.manutencao_fichas_para_raios FOR SELECT TO authenticated USING (public.is_organization_member(organization_id));
CREATE POLICY "manutencao_fichas_para_raios insert by organization members" ON public.manutencao_fichas_para_raios FOR INSERT TO authenticated WITH CHECK (public.is_organization_member(organization_id) AND created_by = auth.uid());
CREATE POLICY "manutencao_fichas_para_raios update by organization members" ON public.manutencao_fichas_para_raios FOR UPDATE TO authenticated USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY "manutencao_fichas_tc_tp select by organization members" ON public.manutencao_fichas_tc_tp FOR SELECT TO authenticated USING (public.is_organization_member(organization_id));
CREATE POLICY "manutencao_fichas_tc_tp insert by organization members" ON public.manutencao_fichas_tc_tp FOR INSERT TO authenticated WITH CHECK (public.is_organization_member(organization_id) AND created_by = auth.uid());
CREATE POLICY "manutencao_fichas_tc_tp update by organization members" ON public.manutencao_fichas_tc_tp FOR UPDATE TO authenticated USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY "manutencao_fichas_cabos_media_tensao select by organization members" ON public.manutencao_fichas_cabos_media_tensao FOR SELECT TO authenticated USING (public.is_organization_member(organization_id));
CREATE POLICY "manutencao_fichas_cabos_media_tensao insert by organization members" ON public.manutencao_fichas_cabos_media_tensao FOR INSERT TO authenticated WITH CHECK (public.is_organization_member(organization_id) AND created_by = auth.uid());
CREATE POLICY "manutencao_fichas_cabos_media_tensao update by organization members" ON public.manutencao_fichas_cabos_media_tensao FOR UPDATE TO authenticated USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY "manutencao_fichas_aterramento select by organization members" ON public.manutencao_fichas_aterramento FOR SELECT TO authenticated USING (public.is_organization_member(organization_id));
CREATE POLICY "manutencao_fichas_aterramento insert by organization members" ON public.manutencao_fichas_aterramento FOR INSERT TO authenticated WITH CHECK (public.is_organization_member(organization_id) AND created_by = auth.uid());
CREATE POLICY "manutencao_fichas_aterramento update by organization members" ON public.manutencao_fichas_aterramento FOR UPDATE TO authenticated USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
