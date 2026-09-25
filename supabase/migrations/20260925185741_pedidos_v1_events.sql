-- M15 / 6A: independent civil-time events with coherent optional contexts.
BEGIN;

DO $$ BEGIN
  IF to_regclass('public.pedido_eventos') IS NOT NULL
     OR to_regprocedure('public.add_pedido_update(uuid,jsonb)') IS NULL
     OR to_regclass('public.pedido_frentes') IS NULL THEN
    RAISE EXCEPTION 'Unexpected M15 predecessor/state' USING ERRCODE='55000';
  END IF;
END $$;

CREATE TABLE public.pedido_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('meeting','visit','external_service','other')),
  titulo text NOT NULL CHECK (char_length(btrim(titulo)) > 0),
  data date NOT NULL,
  horario time without time zone NOT NULL CHECK (horario < TIME '24:00:00'),
  responsavel_user_id uuid NOT NULL DEFAULT auth.uid(),
  observacao text,
  customer_id uuid,
  pedido_id uuid,
  frente_id uuid,
  tarefa_id uuid,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT pedido_eventos_org_id_uidx UNIQUE(organization_id,id),
  CONSTRAINT pedido_eventos_front_requires_order CHECK(frente_id IS NULL OR pedido_id IS NOT NULL),
  CONSTRAINT pedido_eventos_assignee_fkey FOREIGN KEY(organization_id,responsavel_user_id)
    REFERENCES public.organization_members(organization_id,user_id) ON DELETE RESTRICT,
  CONSTRAINT pedido_eventos_customer_fkey FOREIGN KEY(organization_id,customer_id)
    REFERENCES public.customers(organization_id,id) ON DELETE RESTRICT,
  CONSTRAINT pedido_eventos_order_fkey FOREIGN KEY(organization_id,pedido_id)
    REFERENCES public.pedidos(organization_id,id) ON DELETE RESTRICT,
  CONSTRAINT pedido_eventos_front_fkey FOREIGN KEY(organization_id,pedido_id,frente_id)
    REFERENCES public.pedido_frentes(organization_id,pedido_id,id) ON DELETE RESTRICT,
  CONSTRAINT pedido_eventos_task_fkey FOREIGN KEY(organization_id,tarefa_id)
    REFERENCES public.tarefas(organization_id,id) ON DELETE RESTRICT,
  CONSTRAINT pedido_eventos_creator_fkey FOREIGN KEY(created_by)
    REFERENCES auth.users(id) ON DELETE RESTRICT
);
REVOKE ALL ON public.pedido_eventos FROM PUBLIC;
REVOKE ALL ON public.pedido_eventos FROM anon;
REVOKE ALL ON public.pedido_eventos FROM authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.pedido_eventos TO authenticated;
ALTER TABLE public.pedido_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pedido_eventos select by organization members" ON public.pedido_eventos
  FOR SELECT TO authenticated USING (public.is_organization_member(organization_id));
CREATE POLICY "pedido_eventos insert by organization members" ON public.pedido_eventos
  FOR INSERT TO authenticated WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY "pedido_eventos update by organization members" ON public.pedido_eventos
  FOR UPDATE TO authenticated USING (public.is_organization_member(organization_id))
  WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY "pedido_eventos delete by organization members" ON public.pedido_eventos
  FOR DELETE TO authenticated USING (public.is_organization_member(organization_id));

CREATE INDEX pedido_eventos_org_date_idx ON public.pedido_eventos(organization_id,data);
CREATE INDEX pedido_eventos_org_order_date_idx ON public.pedido_eventos(organization_id,pedido_id,data);
CREATE INDEX pedido_eventos_org_task_idx ON public.pedido_eventos(organization_id,tarefa_id)
  WHERE tarefa_id IS NOT NULL;

CREATE FUNCTION private.validate_pedido_event_context()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE task_order uuid; task_front uuid; order_customer uuid;
BEGIN
  PERFORM private.require_pedido_member(NEW.organization_id);
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id
      OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
    RAISE EXCEPTION 'Event identity and provenance cannot change' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' AND auth.uid() IS NOT NULL THEN
    NEW.created_by:=auth.uid();
  END IF;
  NEW.titulo:=btrim(NEW.titulo);
  IF NEW.tarefa_id IS NOT NULL THEN
    SELECT pedido_id,frente_id INTO task_order,task_front FROM public.tarefas
      WHERE organization_id=NEW.organization_id AND id=NEW.tarefa_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Event task not found in organization' USING ERRCODE='23503';
    END IF;
    IF (NEW.pedido_id IS NOT NULL AND NEW.pedido_id IS DISTINCT FROM task_order)
       OR (NEW.frente_id IS NOT NULL AND NEW.frente_id IS DISTINCT FROM task_front) THEN
      RAISE EXCEPTION 'Event task context mismatch' USING ERRCODE='23514';
    END IF;
    NEW.pedido_id:=task_order;
    NEW.frente_id:=task_front;
  END IF;
  IF NEW.frente_id IS NOT NULL AND NEW.pedido_id IS NULL THEN
    RAISE EXCEPTION 'Event Front requires an order' USING ERRCODE='23514';
  END IF;
  IF NEW.pedido_id IS NOT NULL THEN
    SELECT customer_id INTO order_customer FROM public.pedidos
      WHERE organization_id=NEW.organization_id AND id=NEW.pedido_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Event order not found in organization' USING ERRCODE='23503';
    END IF;
    IF order_customer IS NOT NULL AND NEW.customer_id IS NOT NULL
       AND NEW.customer_id IS DISTINCT FROM order_customer THEN
      RAISE EXCEPTION 'Event customer conflicts with order customer; unlink or correct event first'
        USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_OP='UPDATE' THEN NEW.updated_at:=statement_timestamp(); END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.validate_pedido_event_context() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER pedido_eventos_validate_context
  BEFORE INSERT OR UPDATE ON public.pedido_eventos FOR EACH ROW
  EXECUTE FUNCTION private.validate_pedido_event_context();

-- Task Front/order moves retain event coherence in the writer's transaction.
-- remove_pedido_front already locks the Pedido and updates its tasks first.
CREATE FUNCTION private.sync_pedido_task_events_context()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NEW.pedido_id IS DISTINCT FROM OLD.pedido_id
     OR NEW.frente_id IS DISTINCT FROM OLD.frente_id THEN
    UPDATE public.pedido_eventos SET pedido_id=NEW.pedido_id,frente_id=NEW.frente_id
      WHERE organization_id=NEW.organization_id AND tarefa_id=NEW.id;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.sync_pedido_task_events_context() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER tarefas_sync_event_context
  AFTER UPDATE OF pedido_id,frente_id ON public.tarefas FOR EACH ROW
  EXECUTE FUNCTION private.sync_pedido_task_events_context();

CREATE FUNCTION private.guard_pedido_event_customer_change()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id AND NEW.customer_id IS NOT NULL
     AND EXISTS(SELECT 1 FROM public.pedido_eventos e
       WHERE e.organization_id=NEW.organization_id AND e.pedido_id=NEW.id
         AND e.customer_id IS NOT NULL AND e.customer_id IS DISTINCT FROM NEW.customer_id) THEN
    RAISE EXCEPTION 'Order customer conflicts with linked event; adjust event first'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_pedido_event_customer_change() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER pedidos_guard_event_customer
  BEFORE UPDATE OF customer_id ON public.pedidos FOR EACH ROW
  EXECUTE FUNCTION private.guard_pedido_event_customer_change();

COMMIT;
