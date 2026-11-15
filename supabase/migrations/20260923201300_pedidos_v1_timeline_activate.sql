-- M14: make atividades canonical and add coherent attachment contexts.
BEGIN;

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM private.pedidos_v1_rollout WHERE singleton AND status_mode='v1' AND timeline_mode='copying')
     OR to_regprocedure('public.add_pedido_update(uuid,jsonb)') IS NOT NULL
     OR EXISTS(SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='anexos' AND column_name='atividade_id') THEN
    RAISE EXCEPTION 'Unexpected M14 predecessor/state' USING ERRCODE='55000';
  END IF;
END $$;

LOCK TABLE public.comentarios_tarefa IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.atividades,public.anexos IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT organization_id,id FROM public.comentarios_tarefa ORDER BY organization_id,criado_em,id LOOP
    PERFORM private.project_pedido_legacy_comment_row(item.organization_id,item.id);
  END LOOP;
  IF EXISTS(
    SELECT 1 FROM public.comentarios_tarefa c LEFT JOIN public.atividades a
      ON a.organization_id=c.organization_id AND a.source_comment_id=c.id
    WHERE a.id IS NULL OR (a.descricao,a.usuario,a.user_id,a.criado_em,a.tarefa_id)
      IS DISTINCT FROM (c.texto,c.usuario,c.user_id,c.criado_em,c.tarefa_id)
  ) THEN
    RAISE EXCEPTION 'Timeline cutover blocked by an incomplete projection' USING ERRCODE='55000';
  END IF;
END $$;

ALTER TABLE public.anexos
  ADD COLUMN frente_id uuid,
  ADD COLUMN tarefa_id uuid,
  ADD COLUMN atividade_id uuid,
  ADD CONSTRAINT anexos_frente_org_fkey FOREIGN KEY(organization_id,pedido_id,frente_id)
    REFERENCES public.pedido_frentes(organization_id,pedido_id,id) ON DELETE NO ACTION,
  ADD CONSTRAINT anexos_tarefa_org_fkey FOREIGN KEY(organization_id,tarefa_id)
    REFERENCES public.tarefas(organization_id,id) ON DELETE NO ACTION,
  ADD CONSTRAINT anexos_atividade_org_fkey FOREIGN KEY(organization_id,atividade_id)
    REFERENCES public.atividades(organization_id,id) ON DELETE NO ACTION;

CREATE INDEX anexos_org_frente_idx ON public.anexos(organization_id,frente_id) WHERE frente_id IS NOT NULL;
CREATE INDEX anexos_org_tarefa_idx ON public.anexos(organization_id,tarefa_id) WHERE tarefa_id IS NOT NULL;
CREATE INDEX anexos_org_atividade_idx ON public.anexos(organization_id,atividade_id) WHERE atividade_id IS NOT NULL;

CREATE FUNCTION private.validate_pedido_attachment_context()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE task_order uuid; task_front uuid; activity_order uuid; activity_front uuid; activity_task uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.pedidos p
    WHERE p.organization_id=NEW.organization_id AND p.id=NEW.pedido_id) THEN
    RAISE EXCEPTION 'Attachment order not found in organization' USING ERRCODE='23503';
  END IF;
  IF NEW.storage_path NOT LIKE NEW.organization_id::text||'/'||NEW.pedido_id::text||'/%' THEN
    RAISE EXCEPTION 'Attachment storage path must remain under organization/order' USING ERRCODE='23514';
  END IF;
  IF NEW.frente_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.pedido_frentes f
    WHERE f.organization_id=NEW.organization_id AND f.pedido_id=NEW.pedido_id AND f.id=NEW.frente_id) THEN
    RAISE EXCEPTION 'Attachment front/order mismatch' USING ERRCODE='23514';
  END IF;
  IF NEW.tarefa_id IS NOT NULL THEN
    SELECT pedido_id,frente_id INTO task_order,task_front FROM public.tarefas
      WHERE organization_id=NEW.organization_id AND id=NEW.tarefa_id;
    IF NOT FOUND OR task_order IS DISTINCT FROM NEW.pedido_id
       OR NEW.frente_id IS DISTINCT FROM task_front THEN
      RAISE EXCEPTION 'Attachment task context mismatch' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.atividade_id IS NOT NULL THEN
    SELECT pedido_id,frente_id,tarefa_id INTO activity_order,activity_front,activity_task
    FROM public.atividades WHERE organization_id=NEW.organization_id AND id=NEW.atividade_id;
    IF NOT FOUND OR activity_order IS DISTINCT FROM NEW.pedido_id
       OR activity_front IS DISTINCT FROM NEW.frente_id
       OR activity_task IS DISTINCT FROM NEW.tarefa_id THEN
      RAISE EXCEPTION 'Attachment update context mismatch' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.validate_pedido_attachment_context() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER anexos_validate_context
  BEFORE INSERT OR UPDATE OF organization_id,pedido_id,frente_id,tarefa_id,atividade_id,storage_path
  ON public.anexos FOR EACH ROW EXECUTE FUNCTION private.validate_pedido_attachment_context();

ALTER TABLE public.atividades DROP CONSTRAINT atividades_tarefa_org_fkey;
ALTER TABLE public.atividades ADD CONSTRAINT atividades_tarefa_org_fkey
  FOREIGN KEY(organization_id,tarefa_id) REFERENCES public.tarefas(organization_id,id) ON DELETE NO ACTION;

DROP TRIGGER comentarios_tarefa_project_activity ON public.comentarios_tarefa;
DROP FUNCTION private.project_pedido_legacy_comment();
DROP FUNCTION private.project_pedido_legacy_comment_row(uuid,uuid);
REVOKE INSERT,DELETE ON public.comentarios_tarefa FROM authenticated;
REVOKE INSERT,DELETE ON public.atividades FROM authenticated;

CREATE FUNCTION public.list_pedido_timeline(p_org uuid,p_order uuid,p_task uuid)
RETURNS SETOF public.atividades
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM private.require_pedido_member(p_org);
  IF (p_order IS NULL)=(p_task IS NULL) THEN
    RAISE EXCEPTION 'Exactly one timeline scope is required' USING ERRCODE='22023';
  END IF;
  IF p_task IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.tarefas WHERE organization_id=p_org AND id=p_task) THEN
      RAISE EXCEPTION 'Task not found in organization' USING ERRCODE='23503';
    END IF;
    RETURN QUERY SELECT a.* FROM public.atividades a
      WHERE a.organization_id=p_org AND a.tarefa_id=p_task
      ORDER BY a.criado_em DESC,a.id DESC;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM public.pedidos WHERE organization_id=p_org AND id=p_order) THEN
      RAISE EXCEPTION 'Order not found in organization' USING ERRCODE='23503';
    END IF;
    RETURN QUERY SELECT a.* FROM public.atividades a
      LEFT JOIN public.tarefas t ON t.organization_id=a.organization_id AND t.id=a.tarefa_id
      WHERE a.organization_id=p_org AND (a.pedido_id=p_order OR t.pedido_id=p_order)
      ORDER BY a.criado_em DESC,a.id DESC;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.list_pedido_timeline(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_pedido_timeline(uuid,uuid,uuid) TO authenticated;

CREATE FUNCTION public.add_pedido_update(p_org uuid,p_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid; actor_label text; order_input uuid; front_input uuid; task_input uuid;
  resolved_order uuid; resolved_front uuid; follow_value date; new_id uuid;
BEGIN
  actor:=private.require_pedido_member(p_org);
  PERFORM private.assert_pedido_json_object(p_input,
    ARRAY['orderId','frontId','taskId','text','followUpDate'],ARRAY['text'],'update input');
  IF jsonb_typeof(p_input->'text')<>'string' OR btrim(p_input->>'text')='' THEN
    RAISE EXCEPTION 'Update text is required' USING ERRCODE='22023';
  END IF;
  order_input:=CASE WHEN p_input->'orderId' IS NULL OR p_input->'orderId'='null'::jsonb
    THEN NULL ELSE (p_input->>'orderId')::uuid END;
  front_input:=CASE WHEN p_input->'frontId' IS NULL OR p_input->'frontId'='null'::jsonb
    THEN NULL ELSE (p_input->>'frontId')::uuid END;
  task_input:=CASE WHEN p_input->'taskId' IS NULL OR p_input->'taskId'='null'::jsonb
    THEN NULL ELSE (p_input->>'taskId')::uuid END;
  IF task_input IS NOT NULL THEN
    SELECT pedido_id,frente_id INTO resolved_order,resolved_front FROM public.tarefas
      WHERE organization_id=p_org AND id=task_input FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Task not found in organization' USING ERRCODE='23503'; END IF;
    IF (order_input IS NOT NULL AND order_input IS DISTINCT FROM resolved_order)
       OR (front_input IS NOT NULL AND front_input IS DISTINCT FROM resolved_front) THEN
      RAISE EXCEPTION 'Update task context mismatch' USING ERRCODE='23514';
    END IF;
  ELSE
    resolved_order:=order_input; resolved_front:=front_input;
    IF resolved_order IS NULL THEN
      RAISE EXCEPTION 'Update requires an order or task' USING ERRCODE='22023';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.pedidos WHERE organization_id=p_org AND id=resolved_order) THEN
      RAISE EXCEPTION 'Order not found in organization' USING ERRCODE='23503';
    END IF;
    IF resolved_front IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.pedido_frentes
      WHERE organization_id=p_org AND pedido_id=resolved_order AND id=resolved_front) THEN
      RAISE EXCEPTION 'Front not found under order' USING ERRCODE='23514';
    END IF;
  END IF;
  IF p_input ? 'followUpDate' THEN
    IF task_input IS NULL THEN RAISE EXCEPTION 'Follow-up requires a task' USING ERRCODE='22023'; END IF;
    follow_value:=CASE WHEN p_input->'followUpDate'='null'::jsonb THEN NULL
      ELSE (p_input->>'followUpDate')::date END;
    PERFORM set_config('private.pedidos_manual_followup','true',true);
    UPDATE public.tarefas SET follow_up_date=follow_value WHERE organization_id=p_org AND id=task_input;
    PERFORM set_config('private.pedidos_manual_followup','false',true);
  ELSIF task_input IS NOT NULL THEN
    SELECT follow_up_date INTO follow_value FROM public.tarefas WHERE organization_id=p_org AND id=task_input;
  END IF;
  actor_label:=private.pedido_actor_label(p_org,actor);
  INSERT INTO public.atividades(organization_id,pedido_id,frente_id,tarefa_id,descricao,usuario,user_id,
    tipo,event_type,follow_up_date)
  VALUES(p_org,resolved_order,resolved_front,task_input,btrim(p_input->>'text'),actor_label,actor,
    'manual',NULL,follow_value) RETURNING id INTO new_id;
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.add_pedido_update(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.add_pedido_update(uuid,jsonb) TO authenticated;

CREATE FUNCTION public.delete_pedido_update(p_org uuid,p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row_kind text; row_event text;
BEGIN
  PERFORM private.require_pedido_member(p_org);
  SELECT tipo,event_type INTO row_kind,row_event FROM public.atividades
    WHERE organization_id=p_org AND id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Update not found in organization' USING ERRCODE='23503'; END IF;
  IF row_kind<>'manual' OR row_event IS NOT NULL THEN
    RAISE EXCEPTION 'System timeline entries cannot be deleted' USING ERRCODE='42501';
  END IF;
  UPDATE public.anexos SET atividade_id=NULL WHERE organization_id=p_org AND atividade_id=p_id;
  DELETE FROM public.atividades WHERE organization_id=p_org AND id=p_id;
END $$;
REVOKE ALL ON FUNCTION public.delete_pedido_update(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_pedido_update(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.record_pedido_task_event(
  p_org uuid,p_task uuid,p_event text,p_text text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); actor_label text; order_id uuid; front_id uuid; task_title text; follow_value date;
BEGIN
  IF actor IS NULL OR p_event IS NULL OR btrim(p_event)='' OR p_text IS NULL OR btrim(p_text)='' THEN
    RAISE EXCEPTION 'Authenticated actor and event text are required' USING ERRCODE='22023';
  END IF;
  IF p_event='Tarefa atualizada'
     AND coalesce(current_setting('private.pedidos_suppress_update_event',true),'false')='true' THEN
    RETURN;
  END IF;
  SELECT pedido_id,frente_id,descricao,follow_up_date INTO order_id,front_id,task_title,follow_value
  FROM public.tarefas WHERE organization_id=p_org AND id=p_task;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found in organization' USING ERRCODE='23503'; END IF;
  actor_label:=private.pedido_actor_label(p_org,actor);
  IF actor_label IS NULL THEN RAISE EXCEPTION 'Organization membership required' USING ERRCODE='42501'; END IF;
  INSERT INTO public.atividades(organization_id,pedido_id,frente_id,tarefa_id,descricao,usuario,user_id,
    tipo,event_type,follow_up_date,migration_key)
  VALUES(p_org,order_id,front_id,p_task,btrim(p_event)||': '||btrim(p_text)||' ['||task_title||']',
    actor_label,actor,'system',lower(replace(btrim(p_event),' ','_')),follow_value,'system:'||gen_random_uuid());
END $$;
REVOKE ALL ON FUNCTION private.record_pedido_task_event(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.update_pedido_task(p_org uuid,p_id uuid,p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; old_status text; new_status text;
BEGIN
  SELECT status INTO old_status FROM public.tarefas WHERE organization_id=p_org AND id=p_id;
  PERFORM set_config('private.pedidos_manual_due',CASE WHEN p_patch ? 'dueDate' THEN 'true' ELSE 'false' END,true);
  PERFORM set_config('private.pedidos_manual_followup',CASE WHEN p_patch ? 'followUpDate' THEN 'true' ELSE 'false' END,true);
  PERFORM set_config('private.pedidos_suppress_update_event','true',true);
  result:=public.update_pedido_task_m10(p_org,p_id,p_patch);
  PERFORM set_config('private.pedidos_suppress_update_event','false',true);
  PERFORM set_config('private.pedidos_manual_due','false',true);
  PERFORM set_config('private.pedidos_manual_followup','false',true);
  new_status:=result->>'status';
  IF old_status IS DISTINCT FROM new_status THEN
    PERFORM private.record_pedido_task_event(p_org,p_id,
      CASE WHEN new_status='Concluída' THEN 'Tarefa concluída'
        WHEN old_status='Concluída' THEN 'Tarefa reaberta'
        WHEN new_status='Aguardando' THEN 'Tarefa aguardando'
        ELSE 'Status da tarefa alterado' END,
      CASE WHEN new_status='Concluída' THEN 'Concluída'
        WHEN old_status='Concluída' THEN 'Reaberta'
        WHEN new_status='Aguardando' THEN 'Aguardando retorno'
        ELSE new_status END);
  ELSIF p_patch ? 'waiting' THEN
    PERFORM private.record_pedido_task_event(p_org,p_id,'Espera atualizada','Dados de espera alterados');
  END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.update_pedido_task(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_pedido_task(uuid,uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_pedido_task(p_org uuid,p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE order_id uuid; order_status text;
BEGIN
  PERFORM private.require_pedido_member(p_org);
  SELECT pedido_id INTO order_id FROM public.tarefas WHERE organization_id=p_org AND id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found in organization' USING ERRCODE='23503'; END IF;
  IF order_id IS NOT NULL THEN
    SELECT status INTO order_status FROM public.pedidos WHERE organization_id=p_org AND id=order_id FOR UPDATE;
    IF order_status IN ('Finalizado','Cancelado') THEN
      RAISE EXCEPTION 'Closed order must be reopened before removing tasks' USING ERRCODE='23514';
    END IF;
  END IF;
  PERFORM id FROM public.tarefas WHERE organization_id=p_org AND id=p_id FOR UPDATE;
  IF order_id IS NULL AND EXISTS(SELECT 1 FROM public.atividades WHERE organization_id=p_org AND tarefa_id=p_id) THEN
    RAISE EXCEPTION 'Standalone task with timeline must keep its anchor' USING ERRCODE='23514';
  END IF;
  PERFORM private.record_pedido_task_event(p_org,p_id,'Tarefa removida','Removida');
  IF order_id IS NOT NULL THEN
    UPDATE public.atividades SET tarefa_id=NULL WHERE organization_id=p_org AND tarefa_id=p_id;
    UPDATE public.anexos SET tarefa_id=NULL WHERE organization_id=p_org AND tarefa_id=p_id;
  END IF;
  DELETE FROM public.tarefas WHERE organization_id=p_org AND id=p_id;
END $$;
REVOKE ALL ON FUNCTION public.remove_pedido_task(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.remove_pedido_task(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_pedido_front(p_org uuid,p_front uuid,p_destination uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE order_id uuid;
BEGIN
  PERFORM private.require_pedido_member(p_org);
  SELECT pedido_id INTO order_id FROM public.pedido_frentes
    WHERE organization_id=p_org AND id=p_front FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Front not found in organization' USING ERRCODE='23503'; END IF;
  PERFORM id FROM public.pedidos WHERE organization_id=p_org AND id=order_id FOR UPDATE;
  IF p_destination IS NULL THEN
    IF EXISTS(SELECT 1 FROM public.tarefas WHERE organization_id=p_org AND pedido_id=order_id AND frente_id=p_front) THEN
      RAISE EXCEPTION 'Front with tasks requires a destination' USING ERRCODE='23514';
    END IF;
    UPDATE public.atividades SET frente_id=NULL WHERE organization_id=p_org AND pedido_id=order_id AND frente_id=p_front;
    UPDATE public.anexos SET frente_id=NULL WHERE organization_id=p_org AND pedido_id=order_id AND frente_id=p_front;
  ELSE
    IF p_destination=p_front OR NOT EXISTS(SELECT 1 FROM public.pedido_frentes
      WHERE organization_id=p_org AND pedido_id=order_id AND id=p_destination) THEN
      RAISE EXCEPTION 'Destination front not found in the same order' USING ERRCODE='23503';
    END IF;
    UPDATE public.tarefas SET frente_id=p_destination
      WHERE organization_id=p_org AND pedido_id=order_id AND frente_id=p_front;
    UPDATE public.atividades SET frente_id=p_destination
      WHERE organization_id=p_org AND pedido_id=order_id AND frente_id=p_front;
    UPDATE public.anexos SET frente_id=p_destination
      WHERE organization_id=p_org AND pedido_id=order_id AND frente_id=p_front;
  END IF;
  DELETE FROM public.pedido_frentes WHERE organization_id=p_org AND pedido_id=order_id AND id=p_front;
END $$;
REVOKE ALL ON FUNCTION public.remove_pedido_front(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.remove_pedido_front(uuid,uuid,uuid) TO authenticated;

UPDATE private.pedidos_v1_rollout SET timeline_mode='v1' WHERE singleton AND timeline_mode='copying';
COMMIT;
