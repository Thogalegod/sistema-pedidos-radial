-- M01 / 1A.1: additive expansion only. No historical task backfill.
CREATE TABLE public.pedido_frentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  pedido_id uuid NOT NULL,
  nome text NOT NULL CHECK (char_length(btrim(nome)) > 0),
  ordem integer NOT NULL DEFAULT 0,
  is_legacy_default boolean NOT NULL DEFAULT false,
  CONSTRAINT pedido_frentes_pedido_org_fkey
    FOREIGN KEY (organization_id, pedido_id)
    REFERENCES public.pedidos (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT pedido_frentes_org_pedido_id_key UNIQUE (organization_id, pedido_id, id)
);
REVOKE ALL ON public.pedido_frentes FROM PUBLIC;
REVOKE ALL ON public.pedido_frentes FROM anon;
REVOKE ALL ON public.pedido_frentes FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedido_frentes TO authenticated;
ALTER TABLE public.pedido_frentes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pedido_frentes select by organization members"
ON public.pedido_frentes FOR SELECT TO authenticated
USING (public.is_organization_member(organization_id));
CREATE POLICY "pedido_frentes insert by organization members"
ON public.pedido_frentes FOR INSERT TO authenticated
WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY "pedido_frentes update by organization members"
ON public.pedido_frentes FOR UPDATE TO authenticated
USING (public.is_organization_member(organization_id))
WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY "pedido_frentes delete by organization members"
ON public.pedido_frentes FOR DELETE TO authenticated
USING (public.is_organization_member(organization_id));

CREATE UNIQUE INDEX pedido_frentes_legacy_default_uidx
ON public.pedido_frentes (organization_id, pedido_id) WHERE is_legacy_default;
CREATE INDEX pedido_frentes_order_idx ON public.pedido_frentes (organization_id, pedido_id, ordem, id);

ALTER TABLE public.tarefas ADD COLUMN frente_id uuid;
ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_frente_org_pedido_fkey
  FOREIGN KEY (organization_id, pedido_id, frente_id)
  REFERENCES public.pedido_frentes (organization_id, pedido_id, id)
  MATCH SIMPLE ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX tarefas_org_pedido_frente_idx ON public.tarefas (organization_id, pedido_id, frente_id);

-- private already exists with no API-role USAGE. The trigger is the only
-- privileged entry point; the helper also checks the actual JWT identity.
CREATE FUNCTION private.ensure_pedido_default_front(p_org uuid, p_pedido uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE front_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_organization_member(p_org) THEN
    RAISE EXCEPTION 'Organization membership required' USING ERRCODE='42501';
  END IF;
  PERFORM id FROM public.pedidos
  WHERE organization_id=p_org AND id=p_pedido FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found in organization' USING ERRCODE='23503';
  END IF;
  INSERT INTO public.pedido_frentes (organization_id,pedido_id,nome,ordem,is_legacy_default)
  VALUES (p_org,p_pedido,'Geral',0,true)
  ON CONFLICT (organization_id,pedido_id) WHERE is_legacy_default
  DO UPDATE SET is_legacy_default=true RETURNING id INTO front_id;
  RETURN front_id;
END;
$$;
REVOKE ALL ON FUNCTION private.ensure_pedido_default_front(uuid,uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.assign_legacy_pedido_front()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.frente_id IS NULL THEN
    NEW.frente_id := private.ensure_pedido_default_front(NEW.organization_id,NEW.pedido_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.assign_legacy_pedido_front() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER tarefas_assign_legacy_front
BEFORE INSERT ON public.tarefas FOR EACH ROW
EXECUTE FUNCTION private.assign_legacy_pedido_front();
