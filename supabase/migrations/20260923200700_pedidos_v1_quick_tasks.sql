-- M08 / 3A. Allow standalone operational tasks in the existing tarefas table.
-- Existing Pedido tasks remain linked to a valid Frente as a coherent pair.
BEGIN;
SET LOCAL lock_timeout='5s';

LOCK TABLE public.tarefas,public.comentarios_tarefa IN ACCESS EXCLUSIVE MODE NOWAIT;

DO $$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM private.pedidos_v1_rollout
    WHERE singleton AND status_mode='v1' AND timeline_mode='legacy'
  ) THEN
    RAISE EXCEPTION 'M08 requires v1/legacy rollout mode' USING ERRCODE='55000';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.tarefas
    WHERE pedido_id IS NULL OR frente_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Unexpected nullable task link before M08' USING ERRCODE='23514';
  END IF;
END;
$$;

ALTER TABLE public.tarefas ALTER COLUMN pedido_id DROP NOT NULL;
ALTER TABLE public.tarefas DROP CONSTRAINT tarefas_pedido_front_required_check;
ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_pedido_front_pair_check
  CHECK ((pedido_id IS NULL AND frente_id IS NULL)
      OR (pedido_id IS NOT NULL AND frente_id IS NOT NULL));

CREATE INDEX tarefas_org_status_vencimento_idx
  ON public.tarefas(organization_id,status,vencimento);
CREATE INDEX tarefas_org_status_follow_up_idx
  ON public.tarefas(organization_id,status,follow_up_date);

ALTER TABLE public.comentarios_tarefa ADD COLUMN event_type text;

CREATE OR REPLACE FUNCTION private.assign_legacy_pedido_front()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.pedido_id IS NOT NULL AND NEW.frente_id IS NULL THEN
    NEW.frente_id:=private.ensure_pedido_default_front(NEW.organization_id,NEW.pedido_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.assign_legacy_pedido_front() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.protect_pedido_task_note_event()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); actor_label text;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.event_type IS NOT NULL AND current_user IN ('anon','authenticated') THEN
      RAISE EXCEPTION 'System task events can only be written by approved commands' USING ERRCODE='42501';
    END IF;
    IF NEW.event_type IS NULL AND (NEW.usuario IS NULL OR btrim(NEW.usuario)='') THEN
      SELECT coalesce(nullif(btrim(m.display_name),''),'Membro · '||left(actor::text,8))
      INTO actor_label
      FROM public.organization_members m
      WHERE m.organization_id=NEW.organization_id AND m.user_id=actor;
      IF actor_label IS NULL THEN
        RAISE EXCEPTION 'Organization membership required' USING ERRCODE='42501';
      END IF;
      NEW.usuario:=actor_label;
      NEW.user_id:=actor;
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.event_type IS NOT NULL AND current_user IN ('anon','authenticated') THEN
    RAISE EXCEPTION 'System task events cannot be deleted directly' USING ERRCODE='42501';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION private.protect_pedido_task_note_event() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER comentarios_tarefa_protect_system_event
  BEFORE INSERT OR DELETE ON public.comentarios_tarefa
  FOR EACH ROW EXECUTE FUNCTION private.protect_pedido_task_note_event();

CREATE OR REPLACE FUNCTION private.record_pedido_task_event(
  p_org uuid,p_task uuid,p_event text,p_text text
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
  actor uuid:=auth.uid(); actor_label text; order_id uuid; task_title text;
BEGIN
  IF actor IS NULL OR p_event IS NULL OR btrim(p_event)=''
     OR p_text IS NULL OR btrim(p_text)='' THEN
    RAISE EXCEPTION 'Authenticated actor and event text are required' USING ERRCODE='22023';
  END IF;
  SELECT t.pedido_id,t.descricao INTO order_id,task_title
  FROM public.tarefas t WHERE t.organization_id=p_org AND t.id=p_task;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found in organization' USING ERRCODE='23503';
  END IF;
  actor_label:=private.pedido_actor_label(p_org,actor);
  IF actor_label IS NULL THEN
    RAISE EXCEPTION 'Organization membership required' USING ERRCODE='42501';
  END IF;
  IF order_id IS NULL THEN
    INSERT INTO public.comentarios_tarefa(
      organization_id,tarefa_id,texto,usuario,user_id,event_type
    ) VALUES(
      p_org,p_task,btrim(p_event)||': '||btrim(p_text)||' ['||task_title||']',
      actor_label,actor,lower(replace(btrim(p_event),' ','_'))
    );
  ELSE
    INSERT INTO public.atividades(
      organization_id,pedido_id,descricao,usuario,user_id,migration_key
    ) VALUES(
      p_org,order_id,btrim(p_event)||': '||btrim(p_text)||' ['||task_title||']',
      actor_label,actor,'system:'||gen_random_uuid()
    );
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.record_pedido_task_event(uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.create_pedido_task(p_org uuid,p_input jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid; mode text; order_id uuid; order_status text; front_id uuid;
  assignee_id uuid; desired_status text; task_priority text; waiting_input jsonb;
  waiting_type_value text; waiting_user_value uuid; waiting_note_value text; new_id uuid;
BEGIN
  actor:=private.require_pedido_member(p_org);
  PERFORM private.assert_pedido_json_object(
    p_input,
    ARRAY['title','orderId','frontId','description','status','priority','assigneeId','dueDate','followUpDate','waiting'],
    ARRAY['title','orderId','frontId'],'task input'
  );
  IF jsonb_typeof(p_input->'title')<>'string' OR btrim(p_input->>'title')='' THEN
    RAISE EXCEPTION 'Task title is required' USING ERRCODE='22023';
  END IF;
  order_id:=CASE WHEN p_input->'orderId'='null'::jsonb THEN NULL ELSE (p_input->>'orderId')::uuid END;
  front_id:=CASE WHEN p_input->'frontId'='null'::jsonb THEN NULL ELSE (p_input->>'frontId')::uuid END;
  IF order_id IS NULL AND front_id IS NOT NULL THEN
    RAISE EXCEPTION 'Standalone task cannot have a Front' USING ERRCODE='23514';
  END IF;
  IF order_id IS NOT NULL THEN
    SELECT status INTO order_status FROM public.pedidos
    WHERE organization_id=p_org AND id=order_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Order not found in organization' USING ERRCODE='23503';
    END IF;
    IF order_status IN ('Finalizado','Cancelado') THEN
      RAISE EXCEPTION 'Closed order must be reopened before changing tasks' USING ERRCODE='23514';
    END IF;
    IF front_id IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM public.pedido_frentes f
      WHERE f.organization_id=p_org AND f.pedido_id=order_id AND f.id=front_id
    ) THEN
      RAISE EXCEPTION 'Front not found in order' USING ERRCODE='23503';
    END IF;
  END IF;
  SELECT status_mode INTO STRICT mode FROM private.pedidos_v1_rollout WHERE singleton;
  desired_status:=coalesce(p_input->>'status','Aberta');
  IF desired_status NOT IN ('Aberta','Em andamento','Aguardando','Concluída') THEN
    RAISE EXCEPTION 'Invalid task status' USING ERRCODE='22023';
  END IF;
  task_priority:=coalesce(p_input->>'priority','Normal');
  IF task_priority NOT IN ('Urgente','Alta','Normal','Baixa') THEN
    RAISE EXCEPTION 'Invalid task priority' USING ERRCODE='22023';
  END IF;
  assignee_id:=CASE WHEN p_input->'assigneeId' IS NULL OR p_input->'assigneeId'='null'::jsonb
    THEN NULL ELSE (p_input->>'assigneeId')::uuid END;
  IF order_id IS NULL AND assignee_id IS NULL THEN
    RAISE EXCEPTION 'Standalone task requires an assignee' USING ERRCODE='23514';
  END IF;
  IF assignee_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id=p_org AND m.user_id=assignee_id
  ) THEN
    RAISE EXCEPTION 'Assignee is not a member of the organization' USING ERRCODE='23503';
  END IF;
  waiting_input:=CASE WHEN p_input ? 'waiting' THEN p_input->'waiting' ELSE NULL END;
  IF mode='v1' AND desired_status='Aguardando' THEN
    IF waiting_input IS NULL OR waiting_input='null'::jsonb
       OR jsonb_typeof(waiting_input)<>'object' OR NOT (waiting_input ? 'type') THEN
      RAISE EXCEPTION 'Waiting details are required' USING ERRCODE='23514';
    END IF;
    PERFORM private.assert_pedido_json_object(
      waiting_input,ARRAY['type','userId','note'],ARRAY['type'],'waiting details'
    );
    waiting_type_value:=waiting_input->>'type';
    IF waiting_type_value NOT IN ('customer','utility','supplier','internal_user','other') THEN
      RAISE EXCEPTION 'Invalid waiting type' USING ERRCODE='22023';
    END IF;
    waiting_user_value:=CASE WHEN waiting_input->'userId' IS NULL OR waiting_input->'userId'='null'::jsonb
      THEN NULL ELSE (waiting_input->>'userId')::uuid END;
    waiting_note_value:=nullif(btrim(waiting_input->>'note'),'');
    IF (waiting_type_value='internal_user') IS DISTINCT FROM (waiting_user_value IS NOT NULL) THEN
      RAISE EXCEPTION 'Internal waiting requires exactly one member identity' USING ERRCODE='23514';
    END IF;
    IF waiting_user_value IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id=p_org AND m.user_id=waiting_user_value
    ) THEN
      RAISE EXCEPTION 'Waiting user is not a member of the organization' USING ERRCODE='23503';
    END IF;
  END IF;
  INSERT INTO public.tarefas(
    organization_id,pedido_id,frente_id,descricao,descricao_detalhada,status,prioridade,
    responsavel_user_id,vencimento,follow_up_date,waiting_type,waiting_user_id,waiting_note,
    concluido,concluida_em,created_by
  ) VALUES(
    p_org,order_id,front_id,btrim(p_input->>'title'),nullif(btrim(p_input->>'description'),''),
    desired_status,task_priority,assignee_id,
    CASE WHEN p_input->'dueDate' IS NULL OR p_input->'dueDate'='null'::jsonb THEN NULL ELSE (p_input->>'dueDate')::date END,
    CASE WHEN p_input->'followUpDate' IS NULL OR p_input->'followUpDate'='null'::jsonb THEN NULL ELSE (p_input->>'followUpDate')::date END,
    waiting_type_value,waiting_user_value,waiting_note_value,
    desired_status='Concluída',CASE WHEN desired_status='Concluída' THEN statement_timestamp() ELSE NULL END,actor
  ) RETURNING id INTO new_id;
  PERFORM private.record_pedido_task_event(p_org,new_id,'Tarefa criada','Criada');
  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_pedido_task(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_pedido_task(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_pedido_task(p_org uuid,p_id uuid,p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid; order_id uuid; order_status text; current_task public.tarefas%ROWTYPE;
  desired_status text; desired_priority text; desired_front uuid; desired_assignee uuid;
  desired_waiting jsonb;
BEGIN
  actor:=private.require_pedido_member(p_org);
  PERFORM private.assert_pedido_json_object(
    p_patch,
    ARRAY['title','description','frontId','status','priority','assigneeId','dueDate','followUpDate','waiting'],
    ARRAY[]::text[],'task patch'
  );
  IF p_patch='{}'::jsonb THEN
    RAISE EXCEPTION 'Task patch cannot be empty' USING ERRCODE='22023';
  END IF;
  SELECT pedido_id INTO order_id FROM public.tarefas WHERE organization_id=p_org AND id=p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found in organization' USING ERRCODE='23503';
  END IF;
  IF order_id IS NOT NULL THEN
    SELECT status INTO order_status FROM public.pedidos
    WHERE organization_id=p_org AND id=order_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Order not found in organization' USING ERRCODE='23503';
    END IF;
    IF order_status IN ('Finalizado','Cancelado') THEN
      RAISE EXCEPTION 'Closed order must be reopened before changing tasks' USING ERRCODE='23514';
    END IF;
  END IF;
  SELECT * INTO current_task FROM public.tarefas
  WHERE organization_id=p_org AND id=p_id FOR UPDATE;
  IF NOT FOUND OR current_task.pedido_id IS DISTINCT FROM order_id THEN
    RAISE EXCEPTION 'Task changed while acquiring lock; reload' USING ERRCODE='40001';
  END IF;
  desired_status:=CASE WHEN p_patch ? 'status' THEN p_patch->>'status' ELSE current_task.status END;
  IF desired_status NOT IN ('Aberta','Em andamento','Aguardando','Concluída') THEN
    RAISE EXCEPTION 'Invalid task status' USING ERRCODE='22023';
  END IF;
  desired_priority:=CASE WHEN p_patch ? 'priority' THEN p_patch->>'priority' ELSE current_task.prioridade END;
  IF desired_priority NOT IN ('Urgente','Alta','Normal','Baixa') THEN
    RAISE EXCEPTION 'Invalid task priority' USING ERRCODE='22023';
  END IF;
  IF p_patch ? 'title' AND (jsonb_typeof(p_patch->'title')<>'string' OR btrim(p_patch->>'title')='') THEN
    RAISE EXCEPTION 'Task title cannot be empty' USING ERRCODE='22023';
  END IF;
  desired_front:=CASE WHEN p_patch ? 'frontId' THEN
    CASE WHEN p_patch->'frontId'='null'::jsonb THEN NULL ELSE (p_patch->>'frontId')::uuid END
    ELSE current_task.frente_id END;
  IF order_id IS NULL AND desired_front IS NOT NULL THEN
    RAISE EXCEPTION 'Standalone task cannot be linked to a Front' USING ERRCODE='23514';
  END IF;
  IF order_id IS NOT NULL AND desired_front IS NULL THEN
    RAISE EXCEPTION 'Pedido task requires a Front' USING ERRCODE='23514';
  END IF;
  IF desired_front IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.pedido_frentes f
    WHERE f.organization_id=p_org AND f.pedido_id=order_id AND f.id=desired_front
  ) THEN
    RAISE EXCEPTION 'Front not found in order' USING ERRCODE='23503';
  END IF;
  desired_assignee:=CASE WHEN p_patch ? 'assigneeId' THEN
    CASE WHEN p_patch->'assigneeId'='null'::jsonb THEN NULL ELSE (p_patch->>'assigneeId')::uuid END
    ELSE current_task.responsavel_user_id END;
  IF order_id IS NULL AND desired_assignee IS NULL THEN
    RAISE EXCEPTION 'Standalone task requires an assignee' USING ERRCODE='23514';
  END IF;
  IF desired_assignee IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id=p_org AND m.user_id=desired_assignee
  ) THEN
    RAISE EXCEPTION 'Assignee is not a member of the organization' USING ERRCODE='23503';
  END IF;
  desired_waiting:=CASE WHEN p_patch ? 'waiting' THEN p_patch->'waiting'
    WHEN current_task.waiting_type IS NULL THEN NULL
    ELSE jsonb_build_object('type',current_task.waiting_type,'userId',current_task.waiting_user_id,
      'note',current_task.waiting_note) END;
  IF desired_status='Aguardando' AND (
    desired_waiting IS NULL OR desired_waiting='null'::jsonb
    OR jsonb_typeof(desired_waiting)<>'object' OR NOT (desired_waiting ? 'type')
  ) THEN
    RAISE EXCEPTION 'Waiting details are required' USING ERRCODE='23514';
  END IF;
  IF desired_status='Aguardando' THEN
    PERFORM private.assert_pedido_json_object(
      desired_waiting,ARRAY['type','userId','note'],ARRAY['type'],'waiting details'
    );
    IF desired_waiting->>'type' NOT IN ('customer','utility','supplier','internal_user','other') THEN
      RAISE EXCEPTION 'Invalid waiting type' USING ERRCODE='22023';
    END IF;
    IF ((desired_waiting->>'type')='internal_user') IS DISTINCT FROM (
      desired_waiting ? 'userId' AND desired_waiting->'userId'<>'null'::jsonb
    ) THEN
      RAISE EXCEPTION 'Internal waiting requires exactly one member identity' USING ERRCODE='23514';
    END IF;
    IF desired_waiting ? 'userId' AND desired_waiting->'userId'<>'null'::jsonb
       AND NOT EXISTS(
         SELECT 1 FROM public.organization_members m
         WHERE m.organization_id=p_org AND m.user_id=(desired_waiting->>'userId')::uuid
       ) THEN
      RAISE EXCEPTION 'Waiting user is not a member of the organization' USING ERRCODE='23503';
    END IF;
  END IF;
  UPDATE public.tarefas SET
    descricao=CASE WHEN p_patch ? 'title' THEN btrim(p_patch->>'title') ELSE descricao END,
    descricao_detalhada=CASE WHEN p_patch ? 'description' THEN nullif(btrim(p_patch->>'description'),'') ELSE descricao_detalhada END,
    frente_id=desired_front,status=desired_status,prioridade=desired_priority,
    responsavel_user_id=desired_assignee,
    vencimento=CASE WHEN p_patch ? 'dueDate' THEN
      CASE WHEN p_patch->'dueDate'='null'::jsonb THEN NULL ELSE (p_patch->>'dueDate')::date END ELSE vencimento END,
    follow_up_date=CASE WHEN p_patch ? 'followUpDate' THEN
      CASE WHEN p_patch->'followUpDate'='null'::jsonb THEN NULL ELSE (p_patch->>'followUpDate')::date END ELSE follow_up_date END,
    waiting_type=CASE WHEN desired_status<>'Aguardando' THEN NULL
      WHEN p_patch ? 'waiting' THEN desired_waiting->>'type' ELSE waiting_type END,
    waiting_user_id=CASE WHEN desired_status<>'Aguardando' THEN NULL
      WHEN p_patch ? 'waiting' AND desired_waiting ? 'userId' AND desired_waiting->'userId'<>'null'::jsonb
        THEN (desired_waiting->>'userId')::uuid
      WHEN p_patch ? 'waiting' THEN NULL ELSE waiting_user_id END,
    waiting_note=CASE WHEN desired_status<>'Aguardando' THEN NULL
      WHEN p_patch ? 'waiting' THEN nullif(btrim(desired_waiting->>'note'),'') ELSE waiting_note END,
    concluido=CASE WHEN p_patch ? 'status' THEN desired_status='Concluída' ELSE concluido END,
    concluida_em=CASE WHEN p_patch ? 'status' THEN
      CASE WHEN desired_status='Concluída' THEN coalesce(concluida_em,statement_timestamp()) ELSE NULL END
      ELSE concluida_em END
  WHERE organization_id=p_org AND id=p_id;
  PERFORM private.record_pedido_task_event(p_org,p_id,'Tarefa atualizada','Alteração salva');
  RETURN private.pedido_task_json(p_org,p_id);
END;
$$;
REVOKE ALL ON FUNCTION public.update_pedido_task(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_pedido_task(uuid,uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_pedido_subtask(p_org uuid,p_input jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid; order_id uuid; order_status text; task_id uuid; subtask_id uuid; patch jsonb;
BEGIN
  actor:=private.require_pedido_member(p_org);
  PERFORM private.assert_pedido_json_object(
    p_input,ARRAY['id','taskId','patch'],ARRAY['id','taskId','patch'],'subtask input'
  );
  task_id:=(p_input->>'taskId')::uuid;
  patch:=p_input->'patch';
  PERFORM private.assert_pedido_json_object(
    patch,ARRAY['title','completed','dueDate','priority'],ARRAY[]::text[],'subtask patch'
  );
  IF patch='{}'::jsonb THEN
    RAISE EXCEPTION 'Subtask patch cannot be empty' USING ERRCODE='22023';
  END IF;
  SELECT pedido_id INTO order_id FROM public.tarefas WHERE organization_id=p_org AND id=task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found in organization' USING ERRCODE='23503';
  END IF;
  IF order_id IS NOT NULL THEN
    SELECT status INTO order_status FROM public.pedidos
    WHERE organization_id=p_org AND id=order_id FOR UPDATE;
    IF order_status IN ('Finalizado','Cancelado') THEN
      RAISE EXCEPTION 'Closed order must be reopened before changing subtasks' USING ERRCODE='23514';
    END IF;
  END IF;
  PERFORM id FROM public.tarefas WHERE organization_id=p_org AND id=task_id FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found after lock' USING ERRCODE='23503';
  END IF;
  IF p_input->'id'='null'::jsonb THEN
    IF NOT (patch ? 'title') OR jsonb_typeof(patch->'title')<>'string' OR btrim(patch->>'title')='' THEN
      RAISE EXCEPTION 'New subtask requires a title' USING ERRCODE='22023';
    END IF;
    subtask_id:=gen_random_uuid();
    INSERT INTO public.subtarefas(id,organization_id,tarefa_id,descricao,concluida,vencimento,prioridade,created_by)
    VALUES(
      subtask_id,p_org,task_id,btrim(patch->>'title'),coalesce((patch->>'completed')::boolean,false),
      CASE WHEN patch->'dueDate' IS NULL OR patch->'dueDate'='null'::jsonb THEN NULL ELSE (patch->>'dueDate')::date END,
      CASE WHEN patch->'priority' IS NULL OR patch->'priority'='null'::jsonb THEN NULL ELSE patch->>'priority' END,
      actor
    );
  ELSE
    subtask_id:=(p_input->>'id')::uuid;
    UPDATE public.subtarefas SET
      descricao=CASE WHEN patch ? 'title' THEN btrim(patch->>'title') ELSE descricao END,
      concluida=CASE WHEN patch ? 'completed' THEN (patch->>'completed')::boolean ELSE concluida END,
      vencimento=CASE WHEN patch ? 'dueDate' THEN
        CASE WHEN patch->'dueDate'='null'::jsonb THEN NULL ELSE (patch->>'dueDate')::date END ELSE vencimento END,
      prioridade=CASE WHEN patch ? 'priority' THEN
        CASE WHEN patch->'priority'='null'::jsonb THEN NULL ELSE patch->>'priority' END ELSE prioridade END
    WHERE organization_id=p_org AND tarefa_id=task_id AND id=subtask_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Subtask not found under task' USING ERRCODE='23503';
    END IF;
  END IF;
  PERFORM private.record_pedido_task_event(p_org,task_id,'Subtarefa salva','Alteração salva');
END;
$$;
REVOKE ALL ON FUNCTION public.save_pedido_subtask(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_pedido_subtask(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_pedido_task(p_org uuid,p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; order_id uuid; order_status text;
BEGIN
  actor:=private.require_pedido_member(p_org);
  SELECT pedido_id INTO order_id FROM public.tarefas WHERE organization_id=p_org AND id=p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found in organization' USING ERRCODE='23503';
  END IF;
  IF order_id IS NOT NULL THEN
    SELECT status INTO order_status FROM public.pedidos
    WHERE organization_id=p_org AND id=order_id FOR UPDATE;
    IF order_status IN ('Finalizado','Cancelado') THEN
      RAISE EXCEPTION 'Closed order must be reopened before removing tasks' USING ERRCODE='23514';
    END IF;
  END IF;
  PERFORM id FROM public.tarefas WHERE organization_id=p_org AND id=p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found after lock' USING ERRCODE='23503';
  END IF;
  PERFORM private.record_pedido_task_event(p_org,p_id,'Tarefa removida','Removida');
  DELETE FROM public.tarefas WHERE organization_id=p_org AND id=p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.remove_pedido_task(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.remove_pedido_task(uuid,uuid) TO authenticated;

COMMIT;
