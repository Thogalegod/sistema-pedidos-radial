-- M02 / 1A.2. Additive schema; legacy boolean remains the status authority.
-- Focal inspection found no maintained tenant-scoped directory. No name backfill.
ALTER TABLE public.organization_members ADD COLUMN display_name text;
ALTER TABLE public.organization_members ADD CONSTRAINT organization_members_display_name_check
  CHECK (display_name IS NULL OR (display_name=btrim(display_name) AND char_length(display_name) BETWEEN 1 AND 120));

CREATE TABLE private.pedidos_v1_rollout (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  status_mode text NOT NULL CHECK (status_mode IN ('legacy','v1')),
  timeline_mode text NOT NULL CHECK (timeline_mode IN ('legacy','copying','v1'))
);
REVOKE ALL ON private.pedidos_v1_rollout FROM PUBLIC;
REVOKE ALL ON private.pedidos_v1_rollout FROM anon;
REVOKE ALL ON private.pedidos_v1_rollout FROM authenticated;
ALTER TABLE private.pedidos_v1_rollout ENABLE ROW LEVEL SECURITY;
INSERT INTO private.pedidos_v1_rollout(singleton,status_mode,timeline_mode) VALUES(true,'legacy','legacy');

ALTER TABLE public.tarefas
  ADD COLUMN descricao_detalhada text,
  ADD COLUMN status text,
  ADD COLUMN prioridade text DEFAULT 'Normal',
  ADD COLUMN follow_up_date date,
  ADD COLUMN waiting_type text,
  ADD COLUMN waiting_user_id uuid,
  ADD COLUMN waiting_note text,
  ADD COLUMN updated_at timestamptz,
  ADD CONSTRAINT tarefas_status_check CHECK(status IS NULL OR status IN ('Aberta','Em andamento','Aguardando','Concluída')),
  ADD CONSTRAINT tarefas_prioridade_check CHECK(prioridade IS NULL OR prioridade IN ('Urgente','Alta','Normal','Baixa')),
  ADD CONSTRAINT tarefas_waiting_type_check CHECK(waiting_type IS NULL OR waiting_type IN ('customer','utility','supplier','internal_user','other')),
  ADD CONSTRAINT tarefas_waiting_user_check CHECK(
    (waiting_type IS NOT DISTINCT FROM 'internal_user' AND waiting_user_id IS NOT NULL)
    OR (waiting_type IS DISTINCT FROM 'internal_user' AND waiting_user_id IS NULL)),
  ADD CONSTRAINT tarefas_waiting_required_check CHECK(status IS DISTINCT FROM 'Aguardando' OR waiting_type IS NOT NULL),
  ADD CONSTRAINT tarefas_waiting_member_fkey FOREIGN KEY(organization_id,waiting_user_id)
    REFERENCES public.organization_members(organization_id,user_id) ON DELETE RESTRICT,
  ADD CONSTRAINT tarefas_responsavel_member_fkey FOREIGN KEY(organization_id,responsavel_user_id)
    REFERENCES public.organization_members(organization_id,user_id) ON DELETE RESTRICT NOT VALID;
-- Inventory invalid historical identities before later VALIDATE (M07).
-- Existing auth.users FK remains; composite FK prevents silently removing membership.
ALTER TABLE public.pedidos DROP CONSTRAINT pedidos_status_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_status_check CHECK(status IN
  ('Ação Pendente','Aguardando Cliente','Prazo Concessionária','Concluído','Em andamento','Finalizado','Cancelado'));
CREATE INDEX tarefas_org_responsavel_idx ON public.tarefas(organization_id,responsavel_user_id);
CREATE INDEX tarefas_org_status_idx ON public.tarefas(organization_id,status);
CREATE INDEX tarefas_org_follow_up_idx ON public.tarefas(organization_id,follow_up_date) WHERE follow_up_date IS NOT NULL;
CREATE INDEX tarefas_org_waiting_user_idx ON public.tarefas(organization_id,waiting_user_id) WHERE waiting_user_id IS NOT NULL;

-- The RLS on membership deliberately exposes only the caller's row to common
-- members. This narrow directory is the authorized same-tenant read boundary.
CREATE FUNCTION public.list_pedido_members(p_org uuid)
RETURNS TABLE(user_id uuid,display_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_organization_member(p_org) THEN
    RAISE EXCEPTION 'Organization membership required' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT m.user_id,m.display_name FROM public.organization_members m
    WHERE m.organization_id=p_org ORDER BY m.user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.list_pedido_members(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_pedido_members(uuid) TO authenticated;

CREATE FUNCTION public.set_pedido_member_display_name(p_org uuid,p_member uuid,p_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_organization_admin(p_org) THEN
    RAISE EXCEPTION 'Organization admin required' USING ERRCODE='42501';
  END IF;
  IF p_name IS NULL OR p_name<>btrim(p_name) OR char_length(p_name) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Display name must contain 1 to 120 trimmed characters' USING ERRCODE='22023';
  END IF;
  UPDATE public.organization_members SET display_name=p_name
    WHERE organization_id=p_org AND user_id=p_member;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found in organization' USING ERRCODE='23503';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_pedido_member_display_name(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_pedido_member_display_name(uuid,uuid,text) TO authenticated;

CREATE FUNCTION public.assign_legacy_pedido_tasks(p_org uuid,p_task_ids uuid[],p_member uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE task_ids uuid[]; affected integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_organization_admin(p_org) THEN
    RAISE EXCEPTION 'Organization admin required' USING ERRCODE='42501';
  END IF;
  IF p_task_ids IS NULL OR array_position(p_task_ids,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Task IDs must be an array without nulls' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.organization_members WHERE organization_id=p_org AND user_id=p_member FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found in organization' USING ERRCODE='23503';
  END IF;
  SELECT coalesce(array_agg(DISTINCT id ORDER BY id),ARRAY[]::uuid[]) INTO task_ids FROM unnest(p_task_ids) q(id);
  -- Stable lock order and full validation before writing any member association.
  PERFORM id FROM public.tarefas WHERE organization_id=p_org AND id=ANY(task_ids) ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM public.tarefas WHERE organization_id=p_org AND id=ANY(task_ids))<>cardinality(task_ids) THEN
    RAISE EXCEPTION 'Task not found in organization' USING ERRCODE='23503';
  END IF;
  UPDATE public.tarefas SET responsavel_user_id=p_member
    WHERE organization_id=p_org AND id=ANY(task_ids) AND responsavel_user_id IS NULL;
  GET DIAGNOSTICS affected=ROW_COUNT;
  RETURN affected;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_legacy_pedido_tasks(uuid,uuid[],uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assign_legacy_pedido_tasks(uuid,uuid[],uuid) TO authenticated;

CREATE FUNCTION public.pedidos_v1_capabilities(p_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_organization_member(p_org) THEN
    RAISE EXCEPTION 'Organization membership required' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object('statusMode',status_mode,'timelineMode',timeline_mode)
    INTO STRICT result FROM private.pedidos_v1_rollout WHERE singleton;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.pedidos_v1_capabilities(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pedidos_v1_capabilities(uuid) TO authenticated;

CREATE FUNCTION private.sync_legacy_pedido_task_state()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE derived_status text;
BEGIN
  derived_status := CASE WHEN NEW.concluido THEN 'Concluída' ELSE 'Aberta' END;
  IF TG_OP='INSERT' THEN
    IF NEW.status IS NOT NULL AND NEW.status<>derived_status THEN
      RAISE EXCEPTION 'Task status is derived from legacy completion until activation' USING ERRCODE='23514';
    END IF;
    NEW.status := derived_status;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IS DISTINCT FROM derived_status THEN
      RAISE EXCEPTION 'Task status is derived from legacy completion until activation' USING ERRCODE='23514';
    END IF;
    -- Unrelated edits do not backfill a historical NULL status.
    IF NEW.concluido IS DISTINCT FROM OLD.concluido OR NEW.status IS NOT NULL THEN
      NEW.status := derived_status;
    END IF;
    IF OLD.status='Aguardando' AND NEW.status IS DISTINCT FROM 'Aguardando' THEN
      NEW.waiting_type:=NULL;
      NEW.waiting_user_id:=NULL;
      NEW.waiting_note:=NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.sync_legacy_pedido_task_state() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER tarefas_sync_legacy_state BEFORE INSERT OR UPDATE ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION private.sync_legacy_pedido_task_state();

-- Kept separate so the later migration-only backfill can disable this trigger
-- transactionally without weakening workflow/tenant validation. No API bypass flag.
CREATE FUNCTION private.stamp_pedido_task_update()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    NEW.updated_at:=statement_timestamp();
  ELSIF (to_jsonb(NEW)-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at') THEN
    NEW.updated_at:=statement_timestamp();
  ELSE
    NEW.updated_at:=OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.stamp_pedido_task_update() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER tarefas_z_stamp_update BEFORE INSERT OR UPDATE ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION private.stamp_pedido_task_update();
