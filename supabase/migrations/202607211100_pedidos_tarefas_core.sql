-- Pedidos/Tarefas legacy module, rebuilt on the MISFY organization model.
-- This migration intentionally does not copy grants or policies from the legacy project.

CREATE TABLE public.pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  numero_pedido text NOT NULL,
  projeto text NOT NULL,
  cliente text NOT NULL,
  endereco text NOT NULL,
  prioridade text NOT NULL,
  status text NOT NULL,
  data_criacao timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  prazo_concessionaria date,
  cep text,
  customer_id uuid,
  site_id uuid,
  contact_id uuid,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT pedidos_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT pedidos_prioridade_check CHECK (prioridade IN ('Baixa', 'Normal', 'Alta')),
  CONSTRAINT pedidos_status_check CHECK (status IN ('Ação Pendente', 'Aguardando Cliente', 'Prazo Concessionária', 'Concluído')),
  CONSTRAINT pedidos_customer_org_fkey
    FOREIGN KEY (organization_id, customer_id)
    REFERENCES public.customers (organization_id, id)
    ON DELETE SET NULL (customer_id),
  CONSTRAINT pedidos_site_org_fkey
    FOREIGN KEY (organization_id, site_id)
    REFERENCES public.customer_sites (organization_id, id)
    ON DELETE SET NULL (site_id),
  CONSTRAINT pedidos_contact_org_fkey
    FOREIGN KEY (organization_id, contact_id)
    REFERENCES public.customer_contacts (organization_id, id)
    ON DELETE SET NULL (contact_id)
);

CREATE TABLE public.tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  pedido_id uuid NOT NULL,
  descricao text NOT NULL,
  responsavel text,
  responsavel_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  concluido boolean NOT NULL DEFAULT false,
  vencimento date,
  prazo timestamptz,
  concluida_em timestamptz,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT tarefas_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT tarefas_pedido_org_fkey
    FOREIGN KEY (organization_id, pedido_id)
    REFERENCES public.pedidos (organization_id, id)
    ON DELETE CASCADE
);

COMMENT ON COLUMN public.tarefas.prazo IS 'Coluna legada depreciada; mantida temporariamente por compatibilidade e não deve ser usada por código novo.';

CREATE TABLE public.subtarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  tarefa_id uuid,
  descricao text NOT NULL,
  concluida boolean DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT subtarefas_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT subtarefas_tarefa_org_fkey
    FOREIGN KEY (organization_id, tarefa_id)
    REFERENCES public.tarefas (organization_id, id)
    ON DELETE CASCADE
);

CREATE TABLE public.comentarios_tarefa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  tarefa_id uuid,
  texto text NOT NULL,
  usuario text NOT NULL,
  user_id uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT comentarios_tarefa_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT comentarios_tarefa_tarefa_org_fkey
    FOREIGN KEY (organization_id, tarefa_id)
    REFERENCES public.tarefas (organization_id, id)
    ON DELETE CASCADE
);

CREATE TABLE public.atividades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  pedido_id uuid NOT NULL,
  descricao text NOT NULL,
  usuario text NOT NULL,
  user_id uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT atividades_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT atividades_pedido_org_fkey
    FOREIGN KEY (organization_id, pedido_id)
    REFERENCES public.pedidos (organization_id, id)
    ON DELETE CASCADE
);

CREATE TABLE public.anexos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  pedido_id uuid NOT NULL,
  nome_arquivo text NOT NULL,
  legenda text,
  tipo text NOT NULL,
  storage_path text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT anexos_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT anexos_storage_path_uidx UNIQUE (storage_path),
  CONSTRAINT anexos_pedido_org_fkey
    FOREIGN KEY (organization_id, pedido_id)
    REFERENCES public.pedidos (organization_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX pedidos_org_status_idx ON public.pedidos (organization_id, status);
CREATE INDEX pedidos_org_prioridade_idx ON public.pedidos (organization_id, prioridade);
CREATE INDEX pedidos_org_data_criacao_idx ON public.pedidos (organization_id, data_criacao DESC);
CREATE INDEX tarefas_org_pedido_idx ON public.tarefas (organization_id, pedido_id);
CREATE INDEX tarefas_org_conclusao_vencimento_idx ON public.tarefas (organization_id, concluido, vencimento);
CREATE INDEX tarefas_org_responsavel_user_idx ON public.tarefas (organization_id, responsavel_user_id);
CREATE INDEX subtarefas_org_tarefa_idx ON public.subtarefas (organization_id, tarefa_id);
CREATE INDEX comentarios_tarefa_org_tarefa_idx ON public.comentarios_tarefa (organization_id, tarefa_id, criado_em DESC);
CREATE INDEX atividades_org_pedido_idx ON public.atividades (organization_id, pedido_id, criado_em DESC);
CREATE INDEX anexos_org_pedido_idx ON public.anexos (organization_id, pedido_id, criado_em DESC);

ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subtarefas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comentarios_tarefa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atividades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anexos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pedidos, public.tarefas, public.subtarefas, public.comentarios_tarefa, public.atividades, public.anexos FROM PUBLIC;
REVOKE ALL ON public.pedidos, public.tarefas, public.subtarefas, public.comentarios_tarefa, public.atividades, public.anexos FROM anon;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedidos, public.tarefas, public.subtarefas TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.comentarios_tarefa, public.atividades, public.anexos TO authenticated;

CREATE POLICY "pedidos select by organization members"
ON public.pedidos FOR SELECT TO authenticated
USING (public.is_organization_member(organization_id));

CREATE POLICY "pedidos insert by organization members"
ON public.pedidos FOR INSERT TO authenticated
WITH CHECK (public.is_organization_member(organization_id));

CREATE POLICY "pedidos update by organization members"
ON public.pedidos FOR UPDATE TO authenticated
USING (public.is_organization_member(organization_id))
WITH CHECK (public.is_organization_member(organization_id));

CREATE POLICY "pedidos delete by organization members"
ON public.pedidos FOR DELETE TO authenticated
USING (public.is_organization_member(organization_id));

CREATE POLICY "tarefas select by organization members"
ON public.tarefas FOR SELECT TO authenticated
USING (public.is_organization_member(organization_id));

CREATE POLICY "tarefas insert by organization members"
ON public.tarefas FOR INSERT TO authenticated
WITH CHECK (public.is_organization_member(organization_id));

CREATE POLICY "tarefas update by organization members"
ON public.tarefas FOR UPDATE TO authenticated
USING (public.is_organization_member(organization_id))
WITH CHECK (public.is_organization_member(organization_id));

CREATE POLICY "tarefas delete by organization members"
ON public.tarefas FOR DELETE TO authenticated
USING (public.is_organization_member(organization_id));

CREATE POLICY "subtarefas select by organization members"
ON public.subtarefas FOR SELECT TO authenticated
USING (public.is_organization_member(organization_id));

CREATE POLICY "subtarefas insert by organization members"
ON public.subtarefas FOR INSERT TO authenticated
WITH CHECK (public.is_organization_member(organization_id));

CREATE POLICY "subtarefas update by organization members"
ON public.subtarefas FOR UPDATE TO authenticated
USING (public.is_organization_member(organization_id))
WITH CHECK (public.is_organization_member(organization_id));

CREATE POLICY "subtarefas delete by organization members"
ON public.subtarefas FOR DELETE TO authenticated
USING (public.is_organization_member(organization_id));

CREATE POLICY "comentarios_tarefa select by organization members"
ON public.comentarios_tarefa FOR SELECT TO authenticated
USING (public.is_organization_member(organization_id));

CREATE POLICY "comentarios_tarefa insert by organization members"
ON public.comentarios_tarefa FOR INSERT TO authenticated
WITH CHECK (public.is_organization_member(organization_id));

CREATE POLICY "comentarios_tarefa delete by organization members"
ON public.comentarios_tarefa FOR DELETE TO authenticated
USING (public.is_organization_member(organization_id));

CREATE POLICY "atividades select by organization members"
ON public.atividades FOR SELECT TO authenticated
USING (public.is_organization_member(organization_id));

CREATE POLICY "atividades insert by organization members"
ON public.atividades FOR INSERT TO authenticated
WITH CHECK (public.is_organization_member(organization_id));

CREATE POLICY "atividades delete by organization members"
ON public.atividades FOR DELETE TO authenticated
USING (public.is_organization_member(organization_id));

CREATE POLICY "anexos select by organization members"
ON public.anexos FOR SELECT TO authenticated
USING (public.is_organization_member(organization_id));

CREATE POLICY "anexos insert by organization members"
ON public.anexos FOR INSERT TO authenticated
WITH CHECK (public.is_organization_member(organization_id));

CREATE POLICY "anexos delete by organization members"
ON public.anexos FOR DELETE TO authenticated
USING (public.is_organization_member(organization_id));
