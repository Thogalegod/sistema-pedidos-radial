-- Read-only post-M12 verification. Run only against the explicitly confirmed target.
SELECT jsonb_pretty(jsonb_build_object(
  'rollout',(SELECT timeline_mode FROM private.pedidos_v1_rollout WHERE singleton),
  'ownerless',(SELECT count(*) FROM public.atividades WHERE pedido_id IS NULL AND tarefa_id IS NULL),
  'duplicate_sources',(SELECT count(*) FROM (
    SELECT organization_id,source_comment_id FROM public.atividades
    WHERE source_comment_id IS NOT NULL GROUP BY organization_id,source_comment_id HAVING count(*)>1
  ) duplicates),
  'orphan_sources',(SELECT count(*) FROM public.atividades a LEFT JOIN public.comentarios_tarefa c
    ON c.organization_id=a.organization_id AND c.id=a.source_comment_id
    WHERE a.source_comment_id IS NOT NULL AND c.id IS NULL),
  'task_order_mismatch',(SELECT count(*) FROM public.atividades a JOIN public.tarefas t
    ON t.organization_id=a.organization_id AND t.id=a.tarefa_id
    WHERE a.tarefa_id IS NOT NULL AND a.pedido_id IS DISTINCT FROM t.pedido_id),
  'direct_grants',(SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY grantee,privilege_type),'[]'::jsonb)
    FROM (SELECT grantee,privilege_type FROM information_schema.role_table_grants
      WHERE table_schema='public' AND table_name='atividades' AND grantee IN ('anon','authenticated')) g)
)) AS pedidos_v1_timeline_expand_verification;
