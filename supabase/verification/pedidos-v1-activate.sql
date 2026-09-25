-- READ-ONLY. Run after separately authorized M06 activation in IURQ.
-- Aggregates and object metadata only; no names, emails or business text.
SELECT singleton,status_mode,timeline_mode FROM private.pedidos_v1_rollout;

SELECT status,count(*) AS order_count
FROM public.pedidos GROUP BY status ORDER BY status;
SELECT status,count(*) AS task_count
FROM public.tarefas GROUP BY status ORDER BY status;

SELECT count(*) AS legacy_order_statuses
FROM public.pedidos
WHERE status IN('Ação Pendente','Aguardando Cliente','Prazo Concessionária','Concluído');
SELECT count(*) AS task_projection_mismatches
FROM public.tarefas
WHERE concluido IS DISTINCT FROM (status='Concluída')
   OR (status='Concluída' AND concluida_em IS NULL)
   OR (status<>'Concluída' AND concluida_em IS NOT NULL);
SELECT count(*) AS invalid_waiting_state
FROM public.tarefas
WHERE (status='Aguardando') IS DISTINCT FROM (waiting_type IS NOT NULL)
   OR coalesce(waiting_type='internal_user',false) IS DISTINCT FROM (waiting_user_id IS NOT NULL)
   OR (waiting_user_id IS NOT NULL AND NOT EXISTS(
     SELECT 1 FROM public.organization_members m
     WHERE m.organization_id=tarefas.organization_id AND m.user_id=tarefas.waiting_user_id
   ));

SELECT tgname,tgenabled
FROM pg_trigger
WHERE tgrelid='public.tarefas'::regclass
  AND tgname IN('tarefas_sync_legacy_state','tarefas_sync_canonical_state','tarefas_z_stamp_update')
  AND NOT tgisinternal ORDER BY tgname;

SELECT has_table_privilege('authenticated','public.pedidos','SELECT') AS order_select,
  has_table_privilege('authenticated','public.pedidos','INSERT') AS order_insert,
  has_table_privilege('authenticated','public.pedidos','UPDATE') AS order_update,
  has_table_privilege('authenticated','public.pedidos','DELETE') AS order_delete,
  has_table_privilege('authenticated','public.tarefas','SELECT') AS task_select,
  has_table_privilege('authenticated','public.tarefas','INSERT') AS task_insert,
  has_table_privilege('authenticated','public.tarefas','UPDATE') AS task_update,
  has_table_privilege('authenticated','public.tarefas','DELETE') AS task_delete;

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
