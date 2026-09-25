-- Read-only post-M09 verification. Run only against the explicitly confirmed target.
-- Kept as one statement so it works with `supabase db query --file`.
WITH validated_templates AS MATERIALIZED (
  SELECT id,private.validate_pedido_template(definition) AS validated
  FROM public.pedido_templates
),task_rules AS (
  SELECT target.organization_id,target.pedido_id,target.id AS target_id,rule.value AS rule
  FROM public.tarefas target
  CROSS JOIN LATERAL (VALUES(target.vencimento_rule),(target.follow_up_rule)) rule(value)
  WHERE rule.value IS NOT NULL
),subtask_rules AS (
  SELECT child.organization_id,parent.pedido_id,parent.id AS target_id,child.vencimento_rule AS rule
  FROM public.subtarefas child
  JOIN public.tarefas parent
    ON parent.organization_id=child.organization_id AND parent.id=child.tarefa_id
  WHERE child.vencimento_rule IS NOT NULL
),all_rules AS (
  SELECT * FROM task_rules UNION ALL SELECT * FROM subtask_rules
),rule_inventory AS (
  SELECT count(*) AS instance_rules,
         count(*) FILTER (WHERE source.id IS NULL OR rules.pedido_id IS NULL
           OR source.pedido_id IS DISTINCT FROM rules.pedido_id OR source.id=rules.target_id)
           AS invalid_sources,
         count(*) FILTER (WHERE rules.rule->>'state' NOT IN ('pending','materialized','overridden'))
           AS invalid_states,
         count(*) FILTER (WHERE rules.rule->>'state'='pending'
           AND rules.rule->'materializedAt'<>'null'::jsonb) AS invalid_pending_materialization
  FROM all_rules rules
  LEFT JOIN public.tarefas source
    ON source.organization_id=rules.organization_id
   AND source.id=(rules.rule->>'sourceTaskId')::uuid
)
SELECT jsonb_pretty(jsonb_build_object(
  'rollout',(SELECT to_jsonb(r) FROM (
    SELECT status_mode,timeline_mode FROM private.pedidos_v1_rollout WHERE singleton
  ) r),
  'templates',(SELECT to_jsonb(t) FROM (
    SELECT count(*) AS total,
           count(*) FILTER (WHERE version<1) AS invalid_versions,
           count(*) FILTER (WHERE btrim(nome)='') AS blank_names
    FROM public.pedido_templates
  ) t),
  'validated_templates',(SELECT count(*) FROM validated_templates),
  'order_provenance',(SELECT to_jsonb(p) FROM (
    SELECT count(*) AS orders_with_template,
           count(*) FILTER (WHERE template_id IS NULL OR template_version IS NULL OR template_version<1)
             AS invalid_template_provenance,
           count(*) FILTER (WHERE template_request_id IS NOT NULL AND template_id IS NULL)
             AS invalid_request_provenance
    FROM public.pedidos
    WHERE template_id IS NOT NULL OR template_version IS NOT NULL OR template_request_id IS NOT NULL
  ) p),
  'instance_rules',(SELECT to_jsonb(rule_inventory) FROM rule_inventory),
  'constraints',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.conname),'[]'::jsonb) FROM (
    SELECT conrelid::regclass::text AS relation,conname,convalidated
    FROM pg_constraint
    WHERE conname IN (
      'pedido_templates_org_id_uidx','pedido_templates_creator_org_fkey',
      'pedidos_template_pair_check','pedidos_template_request_check','pedidos_template_org_fkey'
    )
  ) c),
  'api_grants',(SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY g.grantee,g.privilege_type),'[]'::jsonb)
    FROM (
      SELECT grantee,privilege_type
      FROM information_schema.role_table_grants
      WHERE table_schema='public' AND table_name='pedido_templates'
        AND grantee IN ('PUBLIC','anon','authenticated')
    ) g),
  'policies',(SELECT coalesce(jsonb_agg(to_jsonb(pol) ORDER BY pol.policyname),'[]'::jsonb) FROM (
    SELECT policyname,roles,cmd
    FROM pg_policies
    WHERE schemaname='public' AND tablename='pedido_templates'
  ) pol),
  'private_functions',(SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.proname),'[]'::jsonb) FROM (
    SELECT p.proname,p.prosecdef AS security_definer,p.proconfig AS function_config,
           has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
           has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='private' AND p.proname IN (
      'validate_pedido_template','validate_pedido_template_rule',
      'validate_pedido_instance_rule','validate_pedido_task_rules',
      'validate_pedido_subtask_rule','protect_pending_rule_source'
    )
  ) f)
)) AS pedidos_v1_templates_verification;
