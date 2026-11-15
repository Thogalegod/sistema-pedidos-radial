-- M03 / 1A.3. Optional subtask fields and a tenant/order-scoped dependency DAG.
-- No task/subtask completion synchronization and no historical backfill.
ALTER TABLE public.subtarefas
  ADD COLUMN vencimento date,
  ADD COLUMN prioridade text,
  ADD CONSTRAINT subtarefas_prioridade_check
    CHECK(prioridade IS NULL OR prioridade IN ('Urgente','Alta','Normal','Baixa'));
CREATE INDEX subtarefas_org_vencimento_idx ON public.subtarefas(organization_id,vencimento)
  WHERE vencimento IS NOT NULL;

ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_org_pedido_id_key
  UNIQUE(organization_id,pedido_id,id);
CREATE TABLE public.tarefa_dependencias (
  organization_id uuid NOT NULL,
  pedido_id uuid NOT NULL,
  tarefa_id uuid NOT NULL,
  predecessora_id uuid NOT NULL,
  PRIMARY KEY(organization_id,tarefa_id,predecessora_id),
  CONSTRAINT tarefa_dependencias_distinct_check CHECK(tarefa_id<>predecessora_id),
  CONSTRAINT tarefa_dependencias_tarefa_fkey FOREIGN KEY(organization_id,pedido_id,tarefa_id)
    REFERENCES public.tarefas(organization_id,pedido_id,id) ON DELETE CASCADE,
  CONSTRAINT tarefa_dependencias_predecessora_fkey FOREIGN KEY(organization_id,pedido_id,predecessora_id)
    REFERENCES public.tarefas(organization_id,pedido_id,id) ON DELETE CASCADE
);
REVOKE ALL ON public.tarefa_dependencias FROM PUBLIC;
REVOKE ALL ON public.tarefa_dependencias FROM anon;
REVOKE ALL ON public.tarefa_dependencias FROM authenticated;
GRANT SELECT ON public.tarefa_dependencias TO authenticated;
ALTER TABLE public.tarefa_dependencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tarefa_dependencias select by organization members"
  ON public.tarefa_dependencias FOR SELECT TO authenticated
  USING(public.is_organization_member(organization_id));
CREATE INDEX tarefa_dependencias_predecessora_idx
  ON public.tarefa_dependencias(organization_id,pedido_id,predecessora_id,tarefa_id);

-- One lock order for both RPCs: parent order, then task identities in UUID order.
-- The helper is private; callers do not gain general table write privileges.
CREATE FUNCTION private.lock_pedido_dependency_scope(p_org uuid,p_task uuid,p_predecessor uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE order_id uuid; task_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_organization_member(p_org) THEN
    RAISE EXCEPTION 'Organization membership required' USING ERRCODE='42501';
  END IF;
  IF p_task IS NULL OR p_predecessor IS NULL THEN
    RAISE EXCEPTION 'Both task IDs are required' USING ERRCODE='22023';
  END IF;
  IF p_task=p_predecessor THEN
    RAISE EXCEPTION 'A task cannot depend on itself' USING ERRCODE='23514';
  END IF;
  -- A fresh snapshot after the parent lock is required for cycle detection.
  -- Reject stronger snapshots instead of mutating the Pedido merely to version it.
  IF current_setting('transaction_isolation') NOT IN ('read committed','read uncommitted') THEN
    RAISE EXCEPTION 'Dependency commands require READ COMMITTED isolation' USING ERRCODE='25001';
  END IF;
  SELECT pedido_id INTO order_id FROM public.tarefas WHERE organization_id=p_org AND id=p_task;
  IF order_id IS NULL THEN
    RAISE EXCEPTION 'Task not found in order' USING ERRCODE='23503';
  END IF;
  PERFORM id FROM public.pedidos WHERE organization_id=p_org AND id=order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE='23503';
  END IF;
  -- Revalidate after waiting; keys cannot move or disappear before the edge write.
  PERFORM id FROM public.tarefas WHERE organization_id=p_org AND pedido_id=order_id
    AND id IN (p_task,p_predecessor) ORDER BY id FOR KEY SHARE;
  GET DIAGNOSTICS task_count=ROW_COUNT;
  IF task_count<>2 THEN
    RAISE EXCEPTION 'Both tasks must belong to the same order and organization' USING ERRCODE='23503';
  END IF;
  RETURN order_id;
END;
$$;
REVOKE ALL ON FUNCTION private.lock_pedido_dependency_scope(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.add_pedido_dependency(p_org uuid,p_task uuid,p_predecessor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE order_id uuid; creates_cycle boolean;
BEGIN
  order_id:=private.lock_pedido_dependency_scope(p_org,p_task,p_predecessor);
  WITH RECURSIVE reach(id) AS (
    SELECT p_predecessor
    UNION
    SELECT d.predecessora_id FROM public.tarefa_dependencias d JOIN reach r ON d.tarefa_id=r.id
      WHERE d.organization_id=p_org AND d.pedido_id=order_id
  ) SELECT EXISTS(SELECT 1 FROM reach WHERE id=p_task) INTO creates_cycle;
  IF creates_cycle THEN
    RAISE EXCEPTION 'Dependency would create a cycle' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.tarefa_dependencias(organization_id,pedido_id,tarefa_id,predecessora_id)
    VALUES(p_org,order_id,p_task,p_predecessor);
END;
$$;
REVOKE ALL ON FUNCTION public.add_pedido_dependency(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.add_pedido_dependency(uuid,uuid,uuid) TO authenticated;

CREATE FUNCTION public.remove_pedido_dependency(p_org uuid,p_task uuid,p_predecessor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE order_id uuid;
BEGIN
  order_id:=private.lock_pedido_dependency_scope(p_org,p_task,p_predecessor);
  DELETE FROM public.tarefa_dependencias WHERE organization_id=p_org AND pedido_id=order_id
    AND tarefa_id=p_task AND predecessora_id=p_predecessor;
END;
$$;
REVOKE ALL ON FUNCTION public.remove_pedido_dependency(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.remove_pedido_dependency(uuid,uuid,uuid) TO authenticated;
