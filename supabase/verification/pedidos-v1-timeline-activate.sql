-- Read-only post-M14 verification. Counts and integrity only; no timeline text.
SELECT jsonb_pretty(jsonb_build_object(
  'timeline_mode',(SELECT timeline_mode FROM private.pedidos_v1_rollout WHERE singleton),
  'legacy_comments',(SELECT count(*) FROM public.comentarios_tarefa),
  'comment_projections',(SELECT count(*) FROM public.atividades WHERE source_comment_id IS NOT NULL),
  'missing_initial_projections',(SELECT count(*) FROM public.comentarios_tarefa c LEFT JOIN public.atividades a
    ON a.organization_id=c.organization_id AND a.source_comment_id=c.id WHERE a.id IS NULL),
  'duplicate_sources',(SELECT count(*) FROM (SELECT organization_id,source_comment_id FROM public.atividades
    WHERE source_comment_id IS NOT NULL GROUP BY organization_id,source_comment_id HAVING count(*)>1) duplicated),
  'ownerless_activities',(SELECT count(*) FROM public.atividades WHERE pedido_id IS NULL AND tarefa_id IS NULL),
  'activity_task_mismatches',(SELECT count(*) FROM public.atividades a JOIN public.tarefas t
    ON t.organization_id=a.organization_id AND t.id=a.tarefa_id
    WHERE a.pedido_id IS DISTINCT FROM t.pedido_id
      OR (a.frente_id IS NOT NULL AND a.frente_id IS DISTINCT FROM t.frente_id)),
  'attachment_context_mismatches',(SELECT count(*) FROM public.anexos x
    LEFT JOIN public.pedido_frentes f ON f.organization_id=x.organization_id AND f.id=x.frente_id
    LEFT JOIN public.tarefas t ON t.organization_id=x.organization_id AND t.id=x.tarefa_id
    LEFT JOIN public.atividades a ON a.organization_id=x.organization_id AND a.id=x.atividade_id
    WHERE (x.frente_id IS NOT NULL AND (f.id IS NULL OR f.pedido_id IS DISTINCT FROM x.pedido_id))
       OR (x.tarefa_id IS NOT NULL AND (t.id IS NULL OR t.pedido_id IS DISTINCT FROM x.pedido_id
         OR t.frente_id IS DISTINCT FROM x.frente_id))
       OR (x.atividade_id IS NOT NULL AND (a.id IS NULL OR a.pedido_id IS DISTINCT FROM x.pedido_id
         OR a.frente_id IS DISTINCT FROM x.frente_id OR a.tarefa_id IS DISTINCT FROM x.tarefa_id))),
  'authenticated_legacy_comment_insert',has_table_privilege('authenticated','public.comentarios_tarefa','INSERT'),
  'authenticated_legacy_comment_delete',has_table_privilege('authenticated','public.comentarios_tarefa','DELETE'),
  'authenticated_direct_activity_insert',has_table_privilege('authenticated','public.atividades','INSERT'),
  'authenticated_direct_activity_delete',has_table_privilege('authenticated','public.atividades','DELETE'),
  'anon_timeline_rpc',has_function_privilege('anon','public.list_pedido_timeline(uuid,uuid,uuid)','EXECUTE'),
  'authenticated_timeline_rpc',has_function_privilege('authenticated','public.list_pedido_timeline(uuid,uuid,uuid)','EXECUTE'),
  'authenticated_add_update_rpc',has_function_privilege('authenticated','public.add_pedido_update(uuid,jsonb)','EXECUTE'),
  'authenticated_delete_update_rpc',has_function_privilege('authenticated','public.delete_pedido_update(uuid,uuid)','EXECUTE')
)) AS pedidos_v1_timeline_activate_verification;
