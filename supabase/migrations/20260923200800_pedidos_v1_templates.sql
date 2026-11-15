-- M09 / 4A. Versioned Pedido blueprints and instance date-rule provenance.
BEGIN;
SET LOCAL lock_timeout='5s';

LOCK TABLE public.pedidos,public.tarefas,public.subtarefas IN ACCESS EXCLUSIVE MODE NOWAIT;

DO $$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM private.pedidos_v1_rollout
    WHERE singleton AND status_mode='v1' AND timeline_mode='legacy'
  ) THEN
    RAISE EXCEPTION 'M09 requires v1/legacy rollout mode' USING ERRCODE='55000';
  END IF;
  IF to_regclass('public.pedido_templates') IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected pedido_templates table before M09' USING ERRCODE='55000';
  END IF;
END;
$$;

CREATE FUNCTION private.validate_pedido_template_rule(p_rule jsonb,p_task_keys text[])
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE kind_value text; offset_value numeric;
BEGIN
  IF p_rule IS NULL OR p_rule='null'::jsonb THEN RETURN; END IF;
  IF jsonb_typeof(p_rule)<>'object' THEN
    RAISE EXCEPTION 'Template date rule must be an object' USING ERRCODE='22023';
  END IF;
  kind_value:=p_rule->>'kind';
  IF kind_value='creation' THEN
    PERFORM private.assert_pedido_json_object(
      p_rule,ARRAY['kind','offsetDays'],ARRAY['kind','offsetDays'],'creation date rule'
    );
  ELSIF kind_value='completion' THEN
    PERFORM private.assert_pedido_json_object(
      p_rule,ARRAY['kind','sourceTaskKey','offsetDays'],
      ARRAY['kind','sourceTaskKey','offsetDays'],'completion date rule'
    );
    IF jsonb_typeof(p_rule->'sourceTaskKey')<>'string'
       OR btrim(p_rule->>'sourceTaskKey')=''
       OR NOT (btrim(p_rule->>'sourceTaskKey')=ANY(p_task_keys)) THEN
      RAISE EXCEPTION 'Completion rule source task is missing' USING ERRCODE='22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unknown template date rule kind' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_rule->'offsetDays')<>'number' THEN
    RAISE EXCEPTION 'Template date offset must be a non-negative integer' USING ERRCODE='22023';
  END IF;
  offset_value:=(p_rule->>'offsetDays')::numeric;
  IF offset_value<0 OR offset_value<>trunc(offset_value) THEN
    RAISE EXCEPTION 'Template date offset must be a non-negative integer' USING ERRCODE='22023';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.validate_pedido_template_rule(jsonb,text[])
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.validate_pedido_template(p_definition jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
  item jsonb; front_keys text[]:=ARRAY[]::text[]; task_keys text[]:=ARRAY[]::text[];
  subtask_keys text[]:=ARRAY[]::text[]; key_value text; position_value numeric;
  has_cycle boolean;
BEGIN
  PERFORM private.assert_pedido_json_object(
    p_definition,ARRAY['schemaVersion','fronts','tasks','subtasks','dependencies'],
    ARRAY['schemaVersion','fronts','tasks','subtasks','dependencies'],'template definition'
  );
  IF jsonb_typeof(p_definition->'schemaVersion')<>'number'
     OR (p_definition->>'schemaVersion')::numeric<>1 THEN
    RAISE EXCEPTION 'Unsupported template schema version' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_definition->'fronts')<>'array'
     OR jsonb_typeof(p_definition->'tasks')<>'array'
     OR jsonb_typeof(p_definition->'subtasks')<>'array'
     OR jsonb_typeof(p_definition->'dependencies')<>'array' THEN
    RAISE EXCEPTION 'Template collections must be arrays' USING ERRCODE='22023';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_definition->'fronts') LOOP
    PERFORM private.assert_pedido_json_object(
      item,ARRAY['key','name','position'],ARRAY['key','name','position'],'template Front'
    );
    key_value:=btrim(item->>'key');
    IF jsonb_typeof(item->'key')<>'string' OR key_value=''
       OR length(key_value)>100 OR key_value=ANY(front_keys) THEN
      RAISE EXCEPTION 'Invalid or duplicate template Front key' USING ERRCODE='22023';
    END IF;
    IF jsonb_typeof(item->'name')<>'string' OR btrim(item->>'name')='' THEN
      RAISE EXCEPTION 'Template Front name is required' USING ERRCODE='22023';
    END IF;
    IF jsonb_typeof(item->'position')<>'number' THEN
      RAISE EXCEPTION 'Template Front position must be a non-negative integer' USING ERRCODE='22023';
    END IF;
    position_value:=(item->>'position')::numeric;
    IF position_value<0 OR position_value<>trunc(position_value) THEN
      RAISE EXCEPTION 'Template Front position must be a non-negative integer' USING ERRCODE='22023';
    END IF;
    front_keys:=array_append(front_keys,key_value);
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(p_definition->'tasks') LOOP
    PERFORM private.assert_pedido_json_object(
      item,ARRAY['key','frontKey','title','description','priority','dueRule','followUpRule'],
      ARRAY['key','frontKey','title','description','priority','dueRule','followUpRule'],'template task'
    );
    key_value:=btrim(item->>'key');
    IF jsonb_typeof(item->'key')<>'string' OR key_value=''
       OR length(key_value)>100 OR key_value=ANY(task_keys) THEN
      RAISE EXCEPTION 'Invalid or duplicate template task key' USING ERRCODE='22023';
    END IF;
    task_keys:=array_append(task_keys,key_value);
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(p_definition->'subtasks') LOOP
    PERFORM private.assert_pedido_json_object(
      item,ARRAY['key','taskKey','title','priority','dueRule'],
      ARRAY['key','taskKey','title','priority','dueRule'],'template subtask'
    );
    key_value:=btrim(item->>'key');
    IF jsonb_typeof(item->'key')<>'string' OR key_value=''
       OR length(key_value)>100 OR key_value=ANY(subtask_keys) THEN
      RAISE EXCEPTION 'Invalid or duplicate template subtask key' USING ERRCODE='22023';
    END IF;
    subtask_keys:=array_append(subtask_keys,key_value);
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(p_definition->'tasks') LOOP
    IF jsonb_typeof(item->'frontKey')<>'string'
       OR NOT (btrim(item->>'frontKey')=ANY(front_keys)) THEN
      RAISE EXCEPTION 'Template task Front is missing' USING ERRCODE='22023';
    END IF;
    IF jsonb_typeof(item->'title')<>'string' OR btrim(item->>'title')='' THEN
      RAISE EXCEPTION 'Template task title is required' USING ERRCODE='22023';
    END IF;
    IF item->'description'<>'null'::jsonb AND jsonb_typeof(item->'description')<>'string' THEN
      RAISE EXCEPTION 'Template task description must be text or null' USING ERRCODE='22023';
    END IF;
    IF jsonb_typeof(item->'priority')<>'string'
       OR item->>'priority' NOT IN ('Urgente','Alta','Normal','Baixa') THEN
      RAISE EXCEPTION 'Invalid template task priority' USING ERRCODE='22023';
    END IF;
    PERFORM private.validate_pedido_template_rule(item->'dueRule',task_keys);
    PERFORM private.validate_pedido_template_rule(item->'followUpRule',task_keys);
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(p_definition->'subtasks') LOOP
    IF jsonb_typeof(item->'taskKey')<>'string'
       OR NOT (btrim(item->>'taskKey')=ANY(task_keys)) THEN
      RAISE EXCEPTION 'Template subtask parent is missing' USING ERRCODE='22023';
    END IF;
    IF jsonb_typeof(item->'title')<>'string' OR btrim(item->>'title')='' THEN
      RAISE EXCEPTION 'Template subtask title is required' USING ERRCODE='22023';
    END IF;
    IF item->'priority'<>'null'::jsonb AND (
      jsonb_typeof(item->'priority')<>'string'
      OR item->>'priority' NOT IN ('Urgente','Alta','Normal','Baixa')
    ) THEN
      RAISE EXCEPTION 'Invalid template subtask priority' USING ERRCODE='22023';
    END IF;
    PERFORM private.validate_pedido_template_rule(item->'dueRule',task_keys);
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(p_definition->'dependencies') LOOP
    PERFORM private.assert_pedido_json_object(
      item,ARRAY['taskKey','predecessorKey'],ARRAY['taskKey','predecessorKey'],'template dependency'
    );
    IF jsonb_typeof(item->'taskKey')<>'string'
       OR jsonb_typeof(item->'predecessorKey')<>'string'
       OR NOT (btrim(item->>'taskKey')=ANY(task_keys))
       OR NOT (btrim(item->>'predecessorKey')=ANY(task_keys)) THEN
      RAISE EXCEPTION 'Template dependency task is missing' USING ERRCODE='22023';
    END IF;
  END LOOP;
  IF (SELECT count(*)<>count(DISTINCT jsonb_build_array(
        btrim(value->>'taskKey'),btrim(value->>'predecessorKey')
      ))
      FROM jsonb_array_elements(p_definition->'dependencies')) THEN
    RAISE EXCEPTION 'Duplicate template dependency' USING ERRCODE='22023';
  END IF;

  WITH RECURSIVE edges AS (
    SELECT btrim(value->>'taskKey') AS task_key,btrim(value->>'predecessorKey') AS predecessor_key
    FROM jsonb_array_elements(p_definition->'dependencies')
  ),walk(start_key,node_key,path,cycle) AS (
    SELECT task_key,predecessor_key,ARRAY[task_key,predecessor_key],task_key=predecessor_key FROM edges
    UNION ALL
    SELECT walk.start_key,edges.predecessor_key,walk.path||edges.predecessor_key,
      edges.predecessor_key=ANY(walk.path)
    FROM walk JOIN edges ON edges.task_key=walk.node_key WHERE NOT walk.cycle
  ) SELECT EXISTS(SELECT 1 FROM walk WHERE cycle) INTO has_cycle;
  IF has_cycle THEN
    RAISE EXCEPTION 'Template dependencies cannot form a cycle' USING ERRCODE='22023';
  END IF;

  WITH RECURSIVE edges AS (
    SELECT btrim(task_item->>'key') AS task_key,
      btrim(rule_item->>'sourceTaskKey') AS predecessor_key
    FROM jsonb_array_elements(p_definition->'tasks') task_item
    CROSS JOIN LATERAL (VALUES(task_item->'dueRule'),(task_item->'followUpRule')) rules(rule_item)
    WHERE rule_item->>'kind'='completion'
    UNION ALL
    SELECT btrim(subtask_item->>'taskKey'),btrim(subtask_item->'dueRule'->>'sourceTaskKey')
    FROM jsonb_array_elements(p_definition->'subtasks') subtask_item
    WHERE subtask_item->'dueRule'->>'kind'='completion'
  ),walk(start_key,node_key,path,cycle) AS (
    SELECT task_key,predecessor_key,ARRAY[task_key,predecessor_key],task_key=predecessor_key FROM edges
    UNION ALL
    SELECT walk.start_key,edges.predecessor_key,walk.path||edges.predecessor_key,
      edges.predecessor_key=ANY(walk.path)
    FROM walk JOIN edges ON edges.task_key=walk.node_key WHERE NOT walk.cycle
  ) SELECT EXISTS(SELECT 1 FROM walk WHERE cycle) INTO has_cycle;
  IF has_cycle THEN
    RAISE EXCEPTION 'Template completion rules cannot form a cycle' USING ERRCODE='22023';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.validate_pedido_template(jsonb) FROM PUBLIC,anon,authenticated;

CREATE TABLE public.pedido_templates(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (btrim(nome)<>''),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  definition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  CONSTRAINT pedido_templates_org_id_uidx UNIQUE(organization_id,id),
  CONSTRAINT pedido_templates_creator_org_fkey
    FOREIGN KEY(organization_id,created_by)
    REFERENCES public.organization_members(organization_id,user_id)
    ON DELETE SET NULL(created_by)
);
ALTER TABLE public.pedido_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pedido_templates FROM PUBLIC;
REVOKE ALL ON public.pedido_templates FROM anon;
REVOKE ALL ON public.pedido_templates FROM authenticated;
GRANT SELECT ON public.pedido_templates TO authenticated;
CREATE POLICY "pedido templates select by organization members"
  ON public.pedido_templates FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id));
CREATE INDEX pedido_templates_org_name_idx ON public.pedido_templates(organization_id,nome);

CREATE FUNCTION private.validate_pedido_template_row()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  NEW.nome:=btrim(NEW.nome);
  PERFORM private.validate_pedido_template(NEW.definition);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.validate_pedido_template_row() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER pedido_templates_validate
  BEFORE INSERT OR UPDATE OF definition,nome ON public.pedido_templates
  FOR EACH ROW EXECUTE FUNCTION private.validate_pedido_template_row();

CREATE FUNCTION private.touch_pedido_template_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN NEW.updated_at:=statement_timestamp(); RETURN NEW; END;
$$;
REVOKE ALL ON FUNCTION private.touch_pedido_template_updated_at() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER pedido_templates_updated_at
  BEFORE UPDATE ON public.pedido_templates
  FOR EACH ROW EXECUTE FUNCTION private.touch_pedido_template_updated_at();

ALTER TABLE public.pedidos
  ADD COLUMN template_id uuid,
  ADD COLUMN template_version integer,
  ADD COLUMN template_request_id uuid,
  ADD CONSTRAINT pedidos_template_pair_check CHECK (
    (template_id IS NULL AND template_version IS NULL)
    OR (template_id IS NOT NULL AND template_version IS NOT NULL AND template_version>0)
  ),
  ADD CONSTRAINT pedidos_template_request_check CHECK (
    template_request_id IS NULL OR template_id IS NOT NULL
  ),
  ADD CONSTRAINT pedidos_template_org_fkey
    FOREIGN KEY(organization_id,template_id)
    REFERENCES public.pedido_templates(organization_id,id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX pedidos_org_template_request_uidx
  ON public.pedidos(organization_id,template_request_id)
  WHERE template_request_id IS NOT NULL;

ALTER TABLE public.tarefas
  ADD COLUMN vencimento_rule jsonb,
  ADD COLUMN follow_up_rule jsonb;
ALTER TABLE public.subtarefas ADD COLUMN vencimento_rule jsonb;

CREATE FUNCTION private.validate_pedido_instance_rule(
  p_org uuid,p_order uuid,p_target_task uuid,p_rule jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE source_task uuid; offset_value numeric; state_value text;
BEGIN
  IF p_rule IS NULL OR p_rule='null'::jsonb THEN RETURN; END IF;
  PERFORM private.assert_pedido_json_object(
    p_rule,ARRAY['sourceTaskId','offsetDays','timeZone','state','materializedAt'],
    ARRAY['sourceTaskId','offsetDays','timeZone','state','materializedAt'],'instance date rule'
  );
  IF p_order IS NULL THEN
    RAISE EXCEPTION 'Standalone task cannot carry a template date rule' USING ERRCODE='23503';
  END IF;
  BEGIN
    IF jsonb_typeof(p_rule->'sourceTaskId')<>'string' THEN RAISE invalid_text_representation; END IF;
    source_task:=(p_rule->>'sourceTaskId')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Instance rule sourceTaskId must be a UUID' USING ERRCODE='22023';
  END;
  IF source_task=p_target_task OR NOT EXISTS(
    SELECT 1 FROM public.tarefas source
    WHERE source.organization_id=p_org AND source.pedido_id=p_order
      AND source.id=source_task AND source.pedido_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Instance rule source must be another task in the same order' USING ERRCODE='23503';
  END IF;
  IF jsonb_typeof(p_rule->'offsetDays')<>'number' THEN
    RAISE EXCEPTION 'Instance rule offset must be a non-negative integer' USING ERRCODE='22023';
  END IF;
  offset_value:=(p_rule->>'offsetDays')::numeric;
  IF offset_value<0 OR offset_value<>trunc(offset_value) THEN
    RAISE EXCEPTION 'Instance rule offset must be a non-negative integer' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_rule->'timeZone')<>'string' OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=p_rule->>'timeZone'
  ) THEN
    RAISE EXCEPTION 'Instance rule timeZone must be a valid IANA zone' USING ERRCODE='22023';
  END IF;
  state_value:=p_rule->>'state';
  IF jsonb_typeof(p_rule->'state')<>'string'
     OR state_value NOT IN ('pending','materialized','overridden') THEN
    RAISE EXCEPTION 'Invalid instance rule state' USING ERRCODE='22023';
  END IF;
  IF state_value='pending' AND p_rule->'materializedAt'<>'null'::jsonb THEN
    RAISE EXCEPTION 'Pending instance rule cannot have materializedAt' USING ERRCODE='22023';
  END IF;
  IF state_value='materialized' AND jsonb_typeof(p_rule->'materializedAt')<>'string' THEN
    RAISE EXCEPTION 'Materialized instance rule requires materializedAt' USING ERRCODE='22023';
  END IF;
  IF p_rule->'materializedAt'<>'null'::jsonb THEN
    BEGIN PERFORM (p_rule->>'materializedAt')::timestamptz;
    EXCEPTION WHEN invalid_datetime_format THEN
      RAISE EXCEPTION 'Invalid materializedAt timestamp' USING ERRCODE='22023';
    END;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.validate_pedido_instance_rule(uuid,uuid,uuid,jsonb)
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.validate_pedido_task_rules()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  PERFORM private.validate_pedido_instance_rule(
    NEW.organization_id,NEW.pedido_id,NEW.id,NEW.vencimento_rule
  );
  PERFORM private.validate_pedido_instance_rule(
    NEW.organization_id,NEW.pedido_id,NEW.id,NEW.follow_up_rule
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.validate_pedido_task_rules() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER tarefas_validate_instance_rules
  BEFORE INSERT OR UPDATE OF organization_id,pedido_id,vencimento_rule,follow_up_rule ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION private.validate_pedido_task_rules();

CREATE FUNCTION private.validate_pedido_subtask_rule()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE parent_order uuid;
BEGIN
  IF NEW.vencimento_rule IS NULL THEN RETURN NEW; END IF;
  SELECT pedido_id INTO parent_order FROM public.tarefas
  WHERE organization_id=NEW.organization_id AND id=NEW.tarefa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subtask parent task not found' USING ERRCODE='23503';
  END IF;
  PERFORM private.validate_pedido_instance_rule(
    NEW.organization_id,parent_order,NEW.tarefa_id,NEW.vencimento_rule
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.validate_pedido_subtask_rule() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER subtarefas_validate_instance_rule
  BEFORE INSERT OR UPDATE OF organization_id,tarefa_id,vencimento_rule ON public.subtarefas
  FOR EACH ROW EXECUTE FUNCTION private.validate_pedido_subtask_rule();

CREATE FUNCTION private.protect_pending_rule_source()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF pg_trigger_depth()>1 THEN RETURN OLD; END IF;
  IF EXISTS(
    SELECT 1 FROM public.tarefas dependent
    WHERE dependent.organization_id=OLD.organization_id
      AND (
        (dependent.vencimento_rule->>'state'='pending'
          AND dependent.vencimento_rule->>'sourceTaskId'=OLD.id::text)
        OR (dependent.follow_up_rule->>'state'='pending'
          AND dependent.follow_up_rule->>'sourceTaskId'=OLD.id::text)
      )
    UNION ALL
    SELECT 1 FROM public.subtarefas dependent
    WHERE dependent.organization_id=OLD.organization_id
      AND dependent.vencimento_rule->>'state'='pending'
      AND dependent.vencimento_rule->>'sourceTaskId'=OLD.id::text
  ) THEN
    RAISE EXCEPTION 'Task is the source of a pending template date rule' USING ERRCODE='23503';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION private.protect_pending_rule_source() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER tarefas_protect_pending_rule_source
  BEFORE DELETE ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION private.protect_pending_rule_source();

COMMIT;
