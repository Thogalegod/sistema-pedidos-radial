-- Read-only post-M11 verification. Run only against the explicitly confirmed target.
SELECT jsonb_pretty(jsonb_build_object(
  'invalid_pending',(
    SELECT count(*) FROM (
      SELECT organization_id,pedido_id,vencimento_rule rule FROM public.tarefas WHERE vencimento_rule->>'state'='pending'
      UNION ALL SELECT organization_id,pedido_id,follow_up_rule FROM public.tarefas WHERE follow_up_rule->>'state'='pending'
    ) r WHERE rule->>'sourceTaskId' IS NULL OR rule->>'timeZone' IS NULL OR rule->>'materializedAt' IS NOT NULL
  ),
  'materialized_without_date',(
    SELECT count(*) FROM (
      SELECT vencimento value,vencimento_rule rule FROM public.tarefas
      UNION ALL SELECT follow_up_date,follow_up_rule FROM public.tarefas
      UNION ALL SELECT vencimento,vencimento_rule FROM public.subtarefas
    ) r WHERE rule->>'state'='materialized' AND (value IS NULL OR rule->>'materializedAt' IS NULL)
  ),
  'cross_order_sources',(
    SELECT count(*) FROM (
      SELECT t.organization_id,t.pedido_id,t.vencimento_rule rule FROM public.tarefas t
      UNION ALL SELECT t.organization_id,t.pedido_id,t.follow_up_rule FROM public.tarefas t
      UNION ALL SELECT s.organization_id,t.pedido_id,s.vencimento_rule
        FROM public.subtarefas s JOIN public.tarefas t ON t.organization_id=s.organization_id AND t.id=s.tarefa_id
    ) r LEFT JOIN public.tarefas source ON source.organization_id=r.organization_id
      AND source.id=(r.rule->>'sourceTaskId')::uuid
    WHERE r.rule IS NOT NULL AND source.pedido_id IS DISTINCT FROM r.pedido_id
  ),
  'private_materializer_anon_execute',has_function_privilege('anon',
    'private.materialize_pedido_completion_rules(uuid,uuid,timestamptz)','EXECUTE')
)) AS pedidos_v1_relative_dates_verification;
