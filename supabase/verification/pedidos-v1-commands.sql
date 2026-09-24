-- READ-ONLY. Run after separately authorized M05 application in IURQ.
-- Aggregates and object metadata only; no names, emails or activity text.
SELECT singleton,status_mode,timeline_mode FROM private.pedidos_v1_rollout;

SELECT p.oid::regprocedure AS function_name,p.prosecdef,p.proconfig,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_proc p WHERE p.oid IN(
  'public.create_pedido(uuid,jsonb)'::regprocedure,
  'public.update_pedido(uuid,uuid,jsonb)'::regprocedure,
  'public.create_pedido_task(uuid,jsonb)'::regprocedure,
  'public.update_pedido_task(uuid,uuid,jsonb)'::regprocedure,
  'public.set_pedido_status(uuid,uuid,text)'::regprocedure,
  'public.save_pedido_subtask(uuid,jsonb)'::regprocedure,
  'public.remove_pedido_task(uuid,uuid)'::regprocedure,
  'public.remove_pedido_front(uuid,uuid,uuid)'::regprocedure
) ORDER BY p.oid::regprocedure::text;

SELECT p.oid::regprocedure AS private_function,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_proc p WHERE p.oid IN(
  'private.record_pedido_task_event(uuid,uuid,text,text)'::regprocedure,
  'private.protect_pedido_system_activity()'::regprocedure
) ORDER BY p.oid::regprocedure::text;

SELECT count(*) FILTER(WHERE migration_key LIKE 'system:%') AS system_events,
  count(*) FILTER(WHERE migration_key LIKE 'system:%' AND user_id IS NULL) AS missing_system_author,
  count(*) FILTER(WHERE migration_key LIKE 'system:%' AND pedido_id IS NULL) AS orphan_system_events
FROM public.atividades;

SELECT count(*) AS invalid_task_orders
FROM public.tarefas t LEFT JOIN public.pedidos p
  ON p.organization_id=t.organization_id AND p.id=t.pedido_id
WHERE t.pedido_id IS NOT NULL AND p.id IS NULL;

SELECT count(*) AS invalid_task_fronts
FROM public.tarefas t JOIN public.pedido_frentes f ON f.id=t.frente_id
WHERE f.organization_id IS DISTINCT FROM t.organization_id
   OR f.pedido_id IS DISTINCT FROM t.pedido_id;

SELECT count(*) AS invalid_assignees
FROM public.tarefas t LEFT JOIN public.organization_members m
  ON m.organization_id=t.organization_id AND m.user_id=t.responsavel_user_id
WHERE t.responsavel_user_id IS NOT NULL AND m.user_id IS NULL;

SELECT count(*) AS invalid_subtask_parents
FROM public.subtarefas s LEFT JOIN public.tarefas t
  ON t.organization_id=s.organization_id AND t.id=s.tarefa_id
WHERE t.id IS NULL;

SELECT count(*) AS legacy_task_projection_mismatches
FROM public.tarefas
WHERE (status='Concluída') IS DISTINCT FROM concluido;

SELECT tgname,tgenabled
FROM pg_trigger
WHERE tgrelid='public.atividades'::regclass
  AND tgname='atividades_protect_system_history'
  AND NOT tgisinternal;

SELECT has_table_privilege('authenticated','public.pedidos','INSERT') AS legacy_order_insert,
  has_table_privilege('authenticated','public.pedidos','UPDATE') AS legacy_order_update,
  has_table_privilege('authenticated','public.tarefas','INSERT') AS legacy_task_insert,
  has_table_privilege('authenticated','public.tarefas','UPDATE') AS legacy_task_update,
  has_table_privilege('authenticated','public.tarefas','DELETE') AS legacy_task_delete;
