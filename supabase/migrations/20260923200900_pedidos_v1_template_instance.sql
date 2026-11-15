-- M10 / 4B. Atomic template commands and Pedido instantiation.
BEGIN;
SET LOCAL lock_timeout='5s';

LOCK TABLE public.pedidos IN ACCESS EXCLUSIVE MODE NOWAIT;

DO $$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM private.pedidos_v1_rollout
    WHERE singleton AND status_mode='v1' AND timeline_mode='legacy'
  ) THEN
    RAISE EXCEPTION 'M10 requires v1/legacy rollout mode' USING ERRCODE='55000';
  END IF;
  IF to_regclass('public.pedido_templates') IS NULL
     OR NOT EXISTS(
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='pedidos' AND column_name='template_request_id'
     ) THEN
    RAISE EXCEPTION 'M10 requires M09 template schema' USING ERRCODE='55000';
  END IF;
  IF EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='pedidos'
      AND column_name='template_request_fingerprint'
  ) OR to_regprocedure('public.save_pedido_template(uuid,jsonb)') IS NOT NULL
     OR to_regprocedure('public.duplicate_pedido_template(uuid,uuid,text)') IS NOT NULL
     OR to_regprocedure('public.instantiate_pedido_template(uuid,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected M10 objects already exist' USING ERRCODE='55000';
  END IF;
END;
$$;

ALTER TABLE public.pedidos
  ADD COLUMN template_request_fingerprint text,
  ADD CONSTRAINT pedidos_template_request_fingerprint_check
    CHECK(template_request_fingerprint IS NULL OR length(template_request_fingerprint)=32);

CREATE FUNCTION private.pedido_template_has_completion_rules(p_definition jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT EXISTS(
    SELECT 1
    FROM jsonb_array_elements(p_definition->'tasks') task_item
    CROSS JOIN LATERAL (VALUES(task_item->'dueRule'),(task_item->'followUpRule')) rules(rule_item)
    WHERE rule_item->>'kind'='completion'
  ) OR EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_definition->'subtasks') subtask_item
    WHERE subtask_item->'dueRule'->>'kind'='completion'
  );
$$;
REVOKE ALL ON FUNCTION private.pedido_template_has_completion_rules(jsonb)
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.pedido_template_result(
  p_id uuid,p_name text,p_version integer,p_definition jsonb
) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT jsonb_build_object(
    'id',p_id,'name',p_name,'version',p_version,'definition',p_definition
  );
$$;
REVOKE ALL ON FUNCTION private.pedido_template_result(uuid,text,integer,jsonb)
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.save_pedido_template(p_org uuid,p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid;
  template_id uuid;
  expected_version integer;
  template_name text;
  template_definition jsonb;
  current_template public.pedido_templates%ROWTYPE;
BEGIN
  actor:=private.require_pedido_member(p_org);
  PERFORM private.assert_pedido_json_object(
    p_input,ARRAY['id','name','expectedVersion','definition'],
    ARRAY['id','name','expectedVersion','definition'],'template input'
  );
  IF jsonb_typeof(p_input->'name')<>'string' OR btrim(p_input->>'name')='' THEN
    RAISE EXCEPTION 'Template name is required' USING ERRCODE='22023';
  END IF;
  template_name:=btrim(p_input->>'name');
  template_definition:=p_input->'definition';
  PERFORM private.validate_pedido_template(template_definition);
  IF private.pedido_template_has_completion_rules(template_definition) THEN
    RAISE EXCEPTION 'Completion-relative rules are enabled in M11' USING ERRCODE='55000';
  END IF;

  IF p_input->'id'='null'::jsonb THEN
    IF p_input->'expectedVersion'<>'null'::jsonb THEN
      RAISE EXCEPTION 'New template cannot have expectedVersion' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.pedido_templates(organization_id,nome,version,definition,created_by)
    VALUES(p_org,template_name,1,template_definition,actor)
    RETURNING * INTO current_template;
  ELSE
    BEGIN
      template_id:=(p_input->>'id')::uuid;
      expected_version:=(p_input->>'expectedVersion')::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Template id and expectedVersion are invalid' USING ERRCODE='22023';
    END;
    IF expected_version IS NULL OR expected_version<1 THEN
      RAISE EXCEPTION 'Expected template version is required' USING ERRCODE='22023';
    END IF;
    SELECT * INTO current_template FROM public.pedido_templates
    WHERE organization_id=p_org AND id=template_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Template not found in organization' USING ERRCODE='23503';
    END IF;
    IF current_template.version<>expected_version THEN
      RAISE EXCEPTION 'Template version conflict' USING ERRCODE='40001';
    END IF;
    UPDATE public.pedido_templates SET
      nome=template_name,definition=template_definition,version=version+1
    WHERE organization_id=p_org AND id=template_id
    RETURNING * INTO current_template;
  END IF;

  RETURN private.pedido_template_result(
    current_template.id,current_template.nome,current_template.version,current_template.definition
  );
END;
$$;
REVOKE ALL ON FUNCTION public.save_pedido_template(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_pedido_template(uuid,jsonb) TO authenticated;

CREATE FUNCTION public.duplicate_pedido_template(p_org uuid,p_id uuid,p_name text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid;
  source_template public.pedido_templates%ROWTYPE;
  copied_template public.pedido_templates%ROWTYPE;
BEGIN
  actor:=private.require_pedido_member(p_org);
  IF p_id IS NULL OR btrim(coalesce(p_name,''))='' THEN
    RAISE EXCEPTION 'Template and copy name are required' USING ERRCODE='22023';
  END IF;
  SELECT * INTO source_template FROM public.pedido_templates
  WHERE organization_id=p_org AND id=p_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found in organization' USING ERRCODE='23503';
  END IF;
  IF private.pedido_template_has_completion_rules(source_template.definition) THEN
    RAISE EXCEPTION 'Completion-relative rules are enabled in M11' USING ERRCODE='55000';
  END IF;
  INSERT INTO public.pedido_templates(organization_id,nome,version,definition,created_by)
  VALUES(p_org,btrim(p_name),1,source_template.definition,actor)
  RETURNING * INTO copied_template;
  RETURN private.pedido_template_result(
    copied_template.id,copied_template.nome,copied_template.version,copied_template.definition
  );
END;
$$;
REVOKE ALL ON FUNCTION public.duplicate_pedido_template(uuid,uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_pedido_template(uuid,uuid,text) TO authenticated;

CREATE FUNCTION public.instantiate_pedido_template(p_org uuid,p_input jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid;
  actor_label text;
  template_id uuid;
  expected_version integer;
  request_id uuid;
  time_zone_value text;
  order_input jsonb;
  request_fingerprint text;
  existing_order_id uuid;
  existing_fingerprint text;
  template_row public.pedido_templates%ROWTYPE;
  new_order_id uuid:=gen_random_uuid();
  local_creation_date date;
  legacy_priority text;
  front_item jsonb;
  task_item jsonb;
  subtask_item jsonb;
  dependency_item jsonb;
  front_map jsonb:='{}'::jsonb;
  task_map jsonb:='{}'::jsonb;
  new_front_id uuid;
  new_task_id uuid;
  due_date date;
  follow_up_date date;
BEGIN
  actor:=private.require_pedido_member(p_org);
  PERFORM private.assert_pedido_json_object(
    p_input,ARRAY['templateId','expectedVersion','requestId','order','timeZone'],
    ARRAY['templateId','expectedVersion','requestId','order','timeZone'],'template instance input'
  );
  BEGIN
    template_id:=(p_input->>'templateId')::uuid;
    expected_version:=(p_input->>'expectedVersion')::integer;
    request_id:=(p_input->>'requestId')::uuid;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Template instance identifiers are invalid' USING ERRCODE='22023';
  END;
  IF expected_version<1 THEN
    RAISE EXCEPTION 'Expected template version is invalid' USING ERRCODE='22023';
  END IF;
  time_zone_value:=p_input->>'timeZone';
  IF jsonb_typeof(p_input->'timeZone')<>'string' OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=time_zone_value
  ) THEN
    RAISE EXCEPTION 'Template instance timeZone must be a valid IANA zone' USING ERRCODE='22023';
  END IF;
  order_input:=p_input->'order';
  PERFORM private.assert_pedido_json_object(
    order_input,
    ARRAY['number','title','client','address','legacyPriority','utilityDueDate','customerId','siteId','contactId','cep'],
    ARRAY['number','title','client','address','legacyPriority','utilityDueDate'],'order input'
  );
  IF jsonb_typeof(order_input->'number')<>'string'
     OR jsonb_typeof(order_input->'title')<>'string'
     OR jsonb_typeof(order_input->'client')<>'string'
     OR jsonb_typeof(order_input->'address')<>'string'
     OR btrim(order_input->>'number')=''
     OR btrim(order_input->>'title')=''
     OR btrim(order_input->>'client')=''
     OR btrim(order_input->>'address')='' THEN
    RAISE EXCEPTION 'Order text fields are required' USING ERRCODE='22023';
  END IF;
  legacy_priority:=order_input->>'legacyPriority';
  IF legacy_priority NOT IN ('Baixa','Normal','Alta') THEN
    RAISE EXCEPTION 'Invalid legacy priority' USING ERRCODE='22023';
  END IF;

  request_fingerprint:=md5(jsonb_build_object(
    'templateId',template_id,'expectedVersion',expected_version,
    'order',order_input,'timeZone',time_zone_value
  )::text);
  SELECT id,template_request_fingerprint INTO existing_order_id,existing_fingerprint
  FROM public.pedidos
  WHERE organization_id=p_org AND template_request_id=request_id FOR UPDATE;
  IF FOUND THEN
    IF existing_fingerprint=request_fingerprint THEN RETURN existing_order_id; END IF;
    RAISE EXCEPTION 'Template request id was already used with another payload' USING ERRCODE='23505';
  END IF;

  SELECT * INTO template_row FROM public.pedido_templates
  WHERE organization_id=p_org AND id=template_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found in organization' USING ERRCODE='23503';
  END IF;
  IF template_row.version<>expected_version THEN
    RAISE EXCEPTION 'Template version conflict' USING ERRCODE='40001';
  END IF;
  PERFORM private.validate_pedido_template(template_row.definition);
  IF private.pedido_template_has_completion_rules(template_row.definition) THEN
    RAISE EXCEPTION 'Completion-relative rules are enabled in M11' USING ERRCODE='55000';
  END IF;
  local_creation_date:=(transaction_timestamp() AT TIME ZONE time_zone_value)::date;

  BEGIN
    INSERT INTO public.pedidos(
      id,organization_id,numero_pedido,projeto,cliente,endereco,prioridade,status,
      prazo_concessionaria,customer_id,site_id,contact_id,cep,created_by,
      template_id,template_version,template_request_id,template_request_fingerprint
    ) VALUES(
      new_order_id,p_org,btrim(order_input->>'number'),btrim(order_input->>'title'),
      btrim(order_input->>'client'),btrim(order_input->>'address'),legacy_priority,'Em andamento',
      CASE WHEN order_input->'utilityDueDate' IS NULL OR order_input->'utilityDueDate'='null'::jsonb
        THEN NULL ELSE (order_input->>'utilityDueDate')::date END,
      CASE WHEN order_input->'customerId' IS NULL OR order_input->'customerId'='null'::jsonb
        THEN NULL ELSE (order_input->>'customerId')::uuid END,
      CASE WHEN order_input->'siteId' IS NULL OR order_input->'siteId'='null'::jsonb
        THEN NULL ELSE (order_input->>'siteId')::uuid END,
      CASE WHEN order_input->'contactId' IS NULL OR order_input->'contactId'='null'::jsonb
        THEN NULL ELSE (order_input->>'contactId')::uuid END,
      nullif(btrim(order_input->>'cep'),''),actor,
      template_id,expected_version,request_id,request_fingerprint
    );
  EXCEPTION WHEN unique_violation THEN
    SELECT id,template_request_fingerprint INTO existing_order_id,existing_fingerprint
    FROM public.pedidos
    WHERE organization_id=p_org AND template_request_id=request_id;
    IF existing_order_id IS NOT NULL AND existing_fingerprint=request_fingerprint THEN
      RETURN existing_order_id;
    END IF;
    RAISE EXCEPTION 'Template request id was already used with another payload' USING ERRCODE='23505';
  END;

  FOR front_item IN SELECT value FROM jsonb_array_elements(template_row.definition->'fronts') LOOP
    new_front_id:=gen_random_uuid();
    INSERT INTO public.pedido_frentes(id,organization_id,pedido_id,nome,ordem,is_legacy_default)
    VALUES(
      new_front_id,p_org,new_order_id,btrim(front_item->>'name'),
      (front_item->>'position')::integer,false
    );
    front_map:=front_map||jsonb_build_object(btrim(front_item->>'key'),new_front_id::text);
  END LOOP;

  FOR task_item IN SELECT value FROM jsonb_array_elements(template_row.definition->'tasks') LOOP
    new_task_id:=gen_random_uuid();
    due_date:=CASE WHEN task_item->'dueRule'->>'kind'='creation'
      THEN local_creation_date+(task_item->'dueRule'->>'offsetDays')::integer ELSE NULL END;
    follow_up_date:=CASE WHEN task_item->'followUpRule'->>'kind'='creation'
      THEN local_creation_date+(task_item->'followUpRule'->>'offsetDays')::integer ELSE NULL END;
    INSERT INTO public.tarefas(
      id,organization_id,pedido_id,frente_id,descricao,descricao_detalhada,status,prioridade,
      responsavel_user_id,vencimento,follow_up_date,waiting_type,waiting_user_id,waiting_note,
      concluido,concluida_em,created_by,vencimento_rule,follow_up_rule
    ) VALUES(
      new_task_id,p_org,new_order_id,(front_map->>btrim(task_item->>'frontKey'))::uuid,
      btrim(task_item->>'title'),nullif(btrim(task_item->>'description'),''),'Aberta',task_item->>'priority',
      actor,due_date,follow_up_date,NULL,NULL,NULL,false,NULL,actor,NULL,NULL
    );
    task_map:=task_map||jsonb_build_object(btrim(task_item->>'key'),new_task_id::text);
  END LOOP;

  FOR subtask_item IN SELECT value FROM jsonb_array_elements(template_row.definition->'subtasks') LOOP
    due_date:=CASE WHEN subtask_item->'dueRule'->>'kind'='creation'
      THEN local_creation_date+(subtask_item->'dueRule'->>'offsetDays')::integer ELSE NULL END;
    INSERT INTO public.subtarefas(
      organization_id,tarefa_id,descricao,concluida,vencimento,prioridade,created_by,vencimento_rule
    ) VALUES(
      p_org,(task_map->>btrim(subtask_item->>'taskKey'))::uuid,btrim(subtask_item->>'title'),
      false,due_date,CASE WHEN subtask_item->'priority'='null'::jsonb THEN NULL
        ELSE subtask_item->>'priority' END,actor,NULL
    );
  END LOOP;

  FOR dependency_item IN SELECT value FROM jsonb_array_elements(template_row.definition->'dependencies') LOOP
    INSERT INTO public.tarefa_dependencias(organization_id,pedido_id,tarefa_id,predecessora_id)
    VALUES(
      p_org,new_order_id,
      (task_map->>btrim(dependency_item->>'taskKey'))::uuid,
      (task_map->>btrim(dependency_item->>'predecessorKey'))::uuid
    );
  END LOOP;

  actor_label:=private.pedido_actor_label(p_org,actor);
  INSERT INTO public.atividades(organization_id,pedido_id,descricao,usuario,user_id,migration_key)
  VALUES(p_org,new_order_id,'Pedido criado a partir do template '||template_row.nome,
    actor_label,actor,'system:'||gen_random_uuid());
  RETURN new_order_id;
END;
$$;
REVOKE ALL ON FUNCTION public.instantiate_pedido_template(uuid,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.instantiate_pedido_template(uuid,jsonb) TO authenticated;

COMMIT;
