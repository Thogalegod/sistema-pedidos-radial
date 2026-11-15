-- Read-only post-M10 verification. Run only against the explicitly confirmed target.
WITH instance_inventory AS (
  SELECT
    count(*) FILTER (WHERE template_request_id IS NOT NULL) AS template_instances,
    count(*) FILTER (WHERE template_request_id IS NOT NULL
      AND (template_id IS NULL OR template_version IS NULL OR template_request_fingerprint IS NULL))
      AS invalid_provenance,
    count(*) FILTER (WHERE template_request_fingerprint IS NOT NULL
      AND length(template_request_fingerprint)<>32) AS invalid_fingerprints
  FROM public.pedidos
),rpc_inventory AS (
  SELECT p.proname,p.prosecdef,p.proconfig,
    has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN (
    'save_pedido_template','duplicate_pedido_template','instantiate_pedido_template'
  )
)
SELECT jsonb_pretty(jsonb_build_object(
  'rollout',(SELECT to_jsonb(r) FROM (
    SELECT status_mode,timeline_mode FROM private.pedidos_v1_rollout WHERE singleton
  ) r),
  'counts',jsonb_build_object(
    'pedidos',(SELECT count(*) FROM public.pedidos),
    'tarefas',(SELECT count(*) FROM public.tarefas),
    'subtarefas',(SELECT count(*) FROM public.subtarefas),
    'templates',(SELECT count(*) FROM public.pedido_templates)
  ),
  'instances',(SELECT to_jsonb(instance_inventory) FROM instance_inventory),
  'fingerprint_constraint',(SELECT to_jsonb(c) FROM (
    SELECT conname,convalidated FROM pg_constraint
    WHERE conrelid='public.pedidos'::regclass
      AND conname='pedidos_template_request_fingerprint_check'
  ) c),
  'template_direct_grants',(SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY g.grantee,g.privilege_type),'[]'::jsonb)
    FROM (
      SELECT grantee,privilege_type FROM information_schema.role_table_grants
      WHERE table_schema='public' AND table_name='pedido_templates'
        AND grantee IN ('PUBLIC','anon','authenticated')
    ) g),
  'rpcs',(SELECT coalesce(jsonb_agg(to_jsonb(rpc_inventory) ORDER BY proname),'[]'::jsonb)
    FROM rpc_inventory)
)) AS pedidos_v1_template_instance_verification;
