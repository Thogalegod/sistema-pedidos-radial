-- Relatorios de Cabine legacy module, rebuilt on the MISFY organization model.
-- This migration intentionally does not copy grants or policies from the legacy project.

CREATE TABLE public.relatorios_cabine (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  legacy_id uuid,
  numero_relatorio text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'gerado',

  customer_id uuid,
  site_id uuid,
  contact_id uuid,

  cliente_nome text NOT NULL,
  cliente_endereco text NOT NULL,
  cliente_cidade text NOT NULL,
  cliente_uf text NOT NULL,
  cliente_cep text,
  cliente_cnpj text,
  cliente_ie text,
  data_execucao date NOT NULL,
  objetivo text DEFAULT 'Relatório de testes Cabine Primária',

  cabo_de text NOT NULL,
  cabo_para text NOT NULL,
  cabo_tipo text DEFAULT 'Cabo',
  cabo_fabricacao text,
  cabo_modelo text DEFAULT 'EPR 8,7/15kV',
  cabo_classe_tensao text DEFAULT '15kV',
  cabo_comprimento text NOT NULL,
  cabo_bitola text NOT NULL,
  cabo_terminais text DEFAULT 'Polimérica',
  cabo_temperatura numeric,
  cabo_umidade numeric,
  cabo_clima text DEFAULT 'Bom',

  hipot_tensao_teste text DEFAULT '35kV',
  hipot_duracao text DEFAULT '15 min',
  hipot_instrumento text,
  hipot_serie_instrumento text,

  megger_tensao_teste text DEFAULT '10kV',
  megger_duracao text DEFAULT '15 min',
  megger_instrumento text,
  megger_serie_instrumento text,

  aterramento_qtde_hastes integer NOT NULL,
  aterramento_tipo text DEFAULT 'Cobre',
  aterramento_classe_tensao text DEFAULT '15kV',
  aterramento_comprimento text,
  aterramento_bitola text DEFAULT '25mm²',
  aterramento_instrumento text,
  aterramento_serie_instrumento text,
  aterramento_temperatura numeric,
  aterramento_umidade numeric,
  aterramento_clima text DEFAULT 'Bom',

  art_numero text,
  art_storage_path text,

  responsavel_nome text DEFAULT 'Roberto Fontes Lopes',
  responsavel_crea text DEFAULT 'CREA 060.104.922.9',

  valores_calculados jsonb NOT NULL,
  cabo_isolacao text DEFAULT 'EPR',
  cabo_secao text DEFAULT '25mm²',
  cabo_emendas text DEFAULT 'Não',
  cabo_instalacao text DEFAULT 'Subterrânea',
  cabo_blindagem text DEFAULT 'Fita de cobre',
  trafo_potencia_kva numeric,
  trafo_tensao_bt text,
  trafo_taps integer[],
  trafo_tap_despacho integer,
  trafo_numero_serie text,
  trafo_fabricante text,
  revisao integer NOT NULL DEFAULT 0,

  CONSTRAINT relatorios_cabine_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT relatorios_cabine_org_numero_uidx UNIQUE (organization_id, numero_relatorio),
  CONSTRAINT relatorios_cabine_status_check
    CHECK (status IN ('gerado', 'revisado', 'emitido', 'cancelado')),
  CONSTRAINT relatorios_cabine_customer_org_fkey
    FOREIGN KEY (organization_id, customer_id)
    REFERENCES public.customers (organization_id, id)
    ON DELETE SET NULL (customer_id),
  CONSTRAINT relatorios_cabine_site_org_fkey
    FOREIGN KEY (organization_id, site_id)
    REFERENCES public.customer_sites (organization_id, id)
    ON DELETE SET NULL (site_id),
  CONSTRAINT relatorios_cabine_contact_org_fkey
    FOREIGN KEY (organization_id, contact_id)
    REFERENCES public.customer_contacts (organization_id, id)
    ON DELETE SET NULL (contact_id)
);

CREATE UNIQUE INDEX relatorios_cabine_org_legacy_id_uidx
  ON public.relatorios_cabine (organization_id, legacy_id)
  WHERE legacy_id IS NOT NULL;

CREATE INDEX relatorios_cabine_org_criado_em_idx
  ON public.relatorios_cabine (organization_id, criado_em DESC);

CREATE INDEX relatorios_cabine_org_status_idx
  ON public.relatorios_cabine (organization_id, status);

CREATE INDEX relatorios_cabine_org_customer_idx
  ON public.relatorios_cabine (organization_id, customer_id);

ALTER TABLE public.relatorios_cabine ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.relatorios_cabine FROM PUBLIC;
REVOKE ALL ON public.relatorios_cabine FROM anon;
REVOKE ALL ON public.relatorios_cabine FROM authenticated;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.relatorios_cabine TO authenticated;

CREATE POLICY "Cabine select by organization members"
ON public.relatorios_cabine
FOR SELECT
TO authenticated
USING (public.is_organization_member(organization_id));

CREATE POLICY "Cabine insert by organization members"
ON public.relatorios_cabine
FOR INSERT
TO authenticated
WITH CHECK (public.is_organization_member(organization_id));

CREATE POLICY "Cabine update by organization members"
ON public.relatorios_cabine
FOR UPDATE
TO authenticated
USING (public.is_organization_member(organization_id))
WITH CHECK (public.is_organization_member(organization_id));

CREATE POLICY "Cabine delete by organization members"
ON public.relatorios_cabine
FOR DELETE
TO authenticated
USING (public.is_organization_member(organization_id));
