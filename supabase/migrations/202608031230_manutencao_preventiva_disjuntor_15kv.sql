-- Local migration draft for Manutencao Preventiva - Ficha de Disjuntor 15 kV.
-- Do not apply before technical review and manual authorization.

ALTER TABLE public.cabine_equipamentos
  DROP CONSTRAINT cabine_equipamentos_tipo_check,
  ADD CONSTRAINT cabine_equipamentos_tipo_check
    CHECK (tipo IN ('transformador', 'disjuntor_15kv'));

CREATE TABLE public.manutencao_fichas_disjuntor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  manutencao_id uuid NOT NULL,
  equipamento_id uuid NOT NULL,
  dados_ficha jsonb NOT NULL,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT manutencao_fichas_disjuntor_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT manutencao_fichas_disjuntor_dados_ficha_object_check
    CHECK (jsonb_typeof(dados_ficha) = 'object'),
  CONSTRAINT manutencao_fichas_disjuntor_manutencao_org_fkey
    FOREIGN KEY (organization_id, manutencao_id)
    REFERENCES public.manutencoes_preventivas (organization_id, id)
    ON DELETE CASCADE
    ON UPDATE NO ACTION,
  CONSTRAINT manutencao_fichas_disjuntor_equipamento_org_fkey
    FOREIGN KEY (organization_id, equipamento_id)
    REFERENCES public.cabine_equipamentos (organization_id, id)
    ON DELETE RESTRICT
    ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX manutencao_fichas_disjuntor_org_manutencao_equipamento_uidx
  ON public.manutencao_fichas_disjuntor (organization_id, manutencao_id, equipamento_id);

CREATE INDEX manutencao_fichas_disjuntor_org_equipamento_idx
  ON public.manutencao_fichas_disjuntor (organization_id, equipamento_id);

CREATE OR REPLACE FUNCTION public.validate_manutencao_ficha_disjuntor()
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
      RAISE EXCEPTION 'A organizacao da ficha do disjuntor nao pode ser alterada';
    END IF;

    IF NEW.manutencao_id IS DISTINCT FROM OLD.manutencao_id THEN
      RAISE EXCEPTION 'A manutencao da ficha do disjuntor nao pode ser alterada';
    END IF;

    IF NEW.equipamento_id IS DISTINCT FROM OLD.equipamento_id THEN
      RAISE EXCEPTION 'O equipamento da ficha do disjuntor nao pode ser alterado';
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

  IF equipment.tipo <> 'disjuntor_15kv' THEN
    RAISE EXCEPTION 'A ficha de disjuntor exige equipamento do tipo disjuntor_15kv';
  END IF;

  IF equipment.cabine_id <> maintenance.cabine_id THEN
    RAISE EXCEPTION 'Equipamento e manutencao preventiva devem pertencer a mesma cabine';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_manutencao_fichas_disjuntor_created_by_trig
  BEFORE INSERT OR UPDATE ON public.manutencao_fichas_disjuntor
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_created_by();

CREATE TRIGGER validate_manutencao_ficha_disjuntor_trig
  BEFORE INSERT OR UPDATE ON public.manutencao_fichas_disjuntor
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_manutencao_ficha_disjuntor();

CREATE TRIGGER set_manutencao_fichas_disjuntor_updated_at
  BEFORE UPDATE ON public.manutencao_fichas_disjuntor
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.manutencao_fichas_disjuntor ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.manutencao_fichas_disjuntor FROM PUBLIC;
REVOKE ALL ON public.manutencao_fichas_disjuntor FROM anon;
REVOKE ALL ON public.manutencao_fichas_disjuntor FROM authenticated;

GRANT SELECT, INSERT, UPDATE ON public.manutencao_fichas_disjuntor TO authenticated;

CREATE POLICY "manutencao_fichas_disjuntor select by organization members"
ON public.manutencao_fichas_disjuntor FOR SELECT TO authenticated
USING (public.is_organization_member(organization_id));

CREATE POLICY "manutencao_fichas_disjuntor insert by organization members"
ON public.manutencao_fichas_disjuntor FOR INSERT TO authenticated
WITH CHECK (
  public.is_organization_member(organization_id)
  AND created_by = auth.uid()
);

CREATE POLICY "manutencao_fichas_disjuntor update by organization members"
ON public.manutencao_fichas_disjuntor FOR UPDATE TO authenticated
USING (public.is_organization_member(organization_id))
WITH CHECK (public.is_organization_member(organization_id));
