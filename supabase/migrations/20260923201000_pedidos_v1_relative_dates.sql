-- M11: one-shot dates relative to the first completion of another task.
BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.instantiate_pedido_template(uuid,jsonb)') IS NULL
     OR to_regprocedure('private.materialize_pedido_completion_rules(uuid,uuid,timestamptz)') IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected M11 predecessor/state' USING ERRCODE='55000';
  END IF;
END;
$$;

-- The temporary M10 gate remains as a compatibility dependency of its renamed functions.
CREATE OR REPLACE FUNCTION private.pedido_template_has_completion_rules(p_definition jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$ SELECT false $$;

ALTER FUNCTION public.instantiate_pedido_template(uuid,jsonb) RENAME TO instantiate_pedido_template_m10;
ALTER FUNCTION public.update_pedido_task(uuid,uuid,jsonb) RENAME TO update_pedido_task_m10;
ALTER FUNCTION public.save_pedido_subtask(uuid,jsonb) RENAME TO save_pedido_subtask_m10;
REVOKE ALL ON FUNCTION public.instantiate_pedido_template_m10(uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.update_pedido_task_m10(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.save_pedido_subtask_m10(uuid,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.materialize_pedido_completion_rules(
  p_org uuid,p_source uuid,p_completed_at timestamptz
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM set_config('private.pedidos_materializing','true',true);
  UPDATE public.tarefas t SET
    vencimento=((p_completed_at AT TIME ZONE (t.vencimento_rule->>'timeZone'))::date
      +(t.vencimento_rule->>'offsetDays')::integer),
    vencimento_rule=jsonb_set(jsonb_set(t.vencimento_rule,'{state}','"materialized"'),
      '{materializedAt}',to_jsonb(p_completed_at::text))
  WHERE t.organization_id=p_org AND t.vencimento_rule->>'state'='pending'
    AND t.vencimento_rule->>'sourceTaskId'=p_source::text;
  UPDATE public.tarefas t SET
    follow_up_date=((p_completed_at AT TIME ZONE (t.follow_up_rule->>'timeZone'))::date
      +(t.follow_up_rule->>'offsetDays')::integer),
    follow_up_rule=jsonb_set(jsonb_set(t.follow_up_rule,'{state}','"materialized"'),
      '{materializedAt}',to_jsonb(p_completed_at::text))
  WHERE t.organization_id=p_org AND t.follow_up_rule->>'state'='pending'
    AND t.follow_up_rule->>'sourceTaskId'=p_source::text;
  UPDATE public.subtarefas s SET
    vencimento=((p_completed_at AT TIME ZONE (s.vencimento_rule->>'timeZone'))::date
      +(s.vencimento_rule->>'offsetDays')::integer),
    vencimento_rule=jsonb_set(jsonb_set(s.vencimento_rule,'{state}','"materialized"'),
      '{materializedAt}',to_jsonb(p_completed_at::text))
  WHERE s.organization_id=p_org AND s.vencimento_rule->>'state'='pending'
    AND s.vencimento_rule->>'sourceTaskId'=p_source::text;
  PERFORM set_config('private.pedidos_materializing','false',true);
END;
$$;
REVOKE ALL ON FUNCTION private.materialize_pedido_completion_rules(uuid,uuid,timestamptz)
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.pedido_relative_date_task_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF coalesce(current_setting('private.pedidos_materializing',true),'false')<>'true' THEN
    IF coalesce(current_setting('private.pedidos_manual_due',true),'false')='true'
       AND NEW.vencimento_rule->>'state'='pending' THEN
      NEW.vencimento_rule:=jsonb_set(NEW.vencimento_rule,'{state}','"overridden"');
    END IF;
    IF coalesce(current_setting('private.pedidos_manual_followup',true),'false')='true'
       AND NEW.follow_up_rule->>'state'='pending' THEN
      NEW.follow_up_rule:=jsonb_set(NEW.follow_up_rule,'{state}','"overridden"');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.pedido_relative_date_task_trigger() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER tarefas_override_pending_relative_dates
  BEFORE UPDATE ON public.tarefas FOR EACH ROW EXECUTE FUNCTION private.pedido_relative_date_task_trigger();

CREATE FUNCTION private.pedido_relative_date_subtask_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF coalesce(current_setting('private.pedidos_materializing',true),'false')<>'true'
     AND coalesce(current_setting('private.pedidos_manual_subtask_due',true),'false')='true'
     AND NEW.vencimento_rule->>'state'='pending' THEN
    NEW.vencimento_rule:=jsonb_set(NEW.vencimento_rule,'{state}','"overridden"');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.pedido_relative_date_subtask_trigger() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER subtarefas_override_pending_relative_date
  BEFORE UPDATE ON public.subtarefas FOR EACH ROW EXECUTE FUNCTION private.pedido_relative_date_subtask_trigger();

CREATE FUNCTION private.pedido_materialize_on_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NEW.status='Concluída' AND OLD.status IS DISTINCT FROM 'Concluída' THEN
    PERFORM private.materialize_pedido_completion_rules(NEW.organization_id,NEW.id,NEW.concluida_em);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.pedido_materialize_on_completion() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER tarefas_materialize_relative_dates
  AFTER UPDATE OF status ON public.tarefas FOR EACH ROW EXECUTE FUNCTION private.pedido_materialize_on_completion();

CREATE FUNCTION public.update_pedido_task(p_org uuid,p_id uuid,p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM set_config('private.pedidos_manual_due',CASE WHEN p_patch ? 'dueDate' THEN 'true' ELSE 'false' END,true);
  PERFORM set_config('private.pedidos_manual_followup',CASE WHEN p_patch ? 'followUpDate' THEN 'true' ELSE 'false' END,true);
  result:=public.update_pedido_task_m10(p_org,p_id,p_patch);
  PERFORM set_config('private.pedidos_manual_due','false',true);
  PERFORM set_config('private.pedidos_manual_followup','false',true);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.update_pedido_task(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_pedido_task(uuid,uuid,jsonb) TO authenticated;

CREATE FUNCTION public.save_pedido_subtask(p_org uuid,p_input jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM set_config('private.pedidos_manual_subtask_due',
    CASE WHEN p_input->'patch' ? 'dueDate' THEN 'true' ELSE 'false' END,true);
  PERFORM public.save_pedido_subtask_m10(p_org,p_input);
  PERFORM set_config('private.pedidos_manual_subtask_due','false',true);
END;
$$;
REVOKE ALL ON FUNCTION public.save_pedido_subtask(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_pedido_subtask(uuid,jsonb) TO authenticated;

CREATE FUNCTION public.instantiate_pedido_template(p_org uuid,p_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  template_id uuid:=(p_input->>'templateId')::uuid;
  original_definition jsonb; marked_definition jsonb; task_item jsonb; subtask_item jsonb;
  order_id uuid; task_id uuid; task_map jsonb:='{}'::jsonb; zone text:=p_input->>'timeZone';
  due_rule jsonb; follow_rule jsonb;
BEGIN
  PERFORM private.require_pedido_member(p_org);
  SELECT definition INTO original_definition FROM public.pedido_templates
    WHERE organization_id=p_org AND id=template_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Template not found in organization' USING ERRCODE='23503'; END IF;
  SELECT jsonb_set(original_definition,'{tasks}',coalesce(jsonb_agg(
    jsonb_set(value,'{title}',to_jsonb('__m11_task__'||btrim(value->>'key')))), '[]'::jsonb))
    INTO marked_definition FROM jsonb_array_elements(original_definition->'tasks');
  SELECT jsonb_set(marked_definition,'{subtasks}',coalesce(jsonb_agg(
    jsonb_set(value,'{title}',to_jsonb('__m11_subtask__'||btrim(value->>'key')))), '[]'::jsonb))
    INTO marked_definition FROM jsonb_array_elements(original_definition->'subtasks');
  UPDATE public.pedido_templates SET definition=marked_definition WHERE organization_id=p_org AND id=template_id;
  order_id:=public.instantiate_pedido_template_m10(p_org,p_input);
  UPDATE public.pedido_templates SET definition=original_definition WHERE organization_id=p_org AND id=template_id;

  -- An idempotent retry returns an already post-processed Pedido from M10.
  IF NOT EXISTS(
    SELECT 1 FROM public.tarefas WHERE organization_id=p_org AND pedido_id=order_id
      AND descricao LIKE '__m11_task__%'
  ) THEN
    RETURN order_id;
  END IF;

  FOR task_item IN SELECT value FROM jsonb_array_elements(original_definition->'tasks') LOOP
    SELECT id INTO task_id FROM public.tarefas WHERE organization_id=p_org AND pedido_id=order_id
      AND descricao='__m11_task__'||btrim(task_item->>'key');
    IF NOT FOUND THEN RAISE EXCEPTION 'Instantiated task map is incomplete' USING ERRCODE='55000'; END IF;
    task_map:=task_map||jsonb_build_object(btrim(task_item->>'key'),task_id::text);
    UPDATE public.tarefas SET descricao=btrim(task_item->>'title'),
      descricao_detalhada=nullif(btrim(task_item->>'description'),'') WHERE id=task_id;
  END LOOP;
  FOR task_item IN SELECT value FROM jsonb_array_elements(original_definition->'tasks') LOOP
    due_rule:=CASE WHEN task_item->'dueRule'->>'kind'='completion' THEN jsonb_build_object(
      'sourceTaskId',(task_map->>btrim(task_item->'dueRule'->>'sourceTaskKey'))::uuid,
      'offsetDays',(task_item->'dueRule'->>'offsetDays')::integer,'timeZone',zone,
      'state','pending','materializedAt',NULL) ELSE NULL END;
    follow_rule:=CASE WHEN task_item->'followUpRule'->>'kind'='completion' THEN jsonb_build_object(
      'sourceTaskId',(task_map->>btrim(task_item->'followUpRule'->>'sourceTaskKey'))::uuid,
      'offsetDays',(task_item->'followUpRule'->>'offsetDays')::integer,'timeZone',zone,
      'state','pending','materializedAt',NULL) ELSE NULL END;
    UPDATE public.tarefas SET vencimento_rule=due_rule,follow_up_rule=follow_rule
      WHERE id=(task_map->>btrim(task_item->>'key'))::uuid;
  END LOOP;
  FOR subtask_item IN SELECT value FROM jsonb_array_elements(original_definition->'subtasks') LOOP
    due_rule:=CASE WHEN subtask_item->'dueRule'->>'kind'='completion' THEN jsonb_build_object(
      'sourceTaskId',(task_map->>btrim(subtask_item->'dueRule'->>'sourceTaskKey'))::uuid,
      'offsetDays',(subtask_item->'dueRule'->>'offsetDays')::integer,'timeZone',zone,
      'state','pending','materializedAt',NULL) ELSE NULL END;
    UPDATE public.subtarefas SET descricao=btrim(subtask_item->>'title'),vencimento_rule=due_rule
      WHERE organization_id=p_org AND tarefa_id=(task_map->>btrim(subtask_item->>'taskKey'))::uuid
        AND descricao='__m11_subtask__'||btrim(subtask_item->>'key');
  END LOOP;
  RETURN order_id;
END;
$$;
REVOKE ALL ON FUNCTION public.instantiate_pedido_template(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.instantiate_pedido_template(uuid,jsonb) TO authenticated;

CREATE INDEX tarefas_pending_due_source_idx ON public.tarefas(organization_id,((vencimento_rule->>'sourceTaskId')::uuid))
  WHERE vencimento_rule->>'state'='pending';
CREATE INDEX tarefas_pending_followup_source_idx ON public.tarefas(organization_id,((follow_up_rule->>'sourceTaskId')::uuid))
  WHERE follow_up_rule->>'state'='pending';
CREATE INDEX subtarefas_pending_due_source_idx ON public.subtarefas(organization_id,((vencimento_rule->>'sourceTaskId')::uuid))
  WHERE vencimento_rule->>'state'='pending';

COMMIT;
