-- Read-only M04 inventory. Run before and after on the explicitly approved IURQ.
-- Save every result: preserved_rows/fingerprint must match between executions.
-- Activities created by M04 are excluded only from the preservation comparison.
WITH preserved AS (
 SELECT 'pedidos' AS relation,id,to_jsonb(p)-'status' AS row FROM public.pedidos p
 UNION ALL SELECT 'tarefas',id,to_jsonb(t)-ARRAY['frente_id','status'] FROM public.tarefas t
 UNION ALL SELECT 'subtarefas',id,to_jsonb(s) FROM public.subtarefas s
 UNION ALL SELECT 'comentarios_tarefa',id,to_jsonb(c) FROM public.comentarios_tarefa c
 UNION ALL SELECT 'atividades',id,to_jsonb(a)-'migration_key' FROM public.atividades a
   WHERE to_jsonb(a)->>'migration_key' IS NULL
 UNION ALL SELECT 'anexos',id,to_jsonb(a) FROM public.anexos a
), names(relation) AS (VALUES('pedidos'),('tarefas'),('subtarefas'),('comentarios_tarefa'),('atividades'),('anexos'))
SELECT n.relation,count(p.id) AS preserved_rows,
 md5(coalesce(string_agg(p.row::text,'|' ORDER BY p.id),'')) AS preserved_fingerprint
FROM names n LEFT JOIN preserved p USING(relation) GROUP BY n.relation ORDER BY n.relation;

SELECT
 (SELECT count(*) FROM public.pedidos) AS orders,
 (SELECT count(*) FROM public.tarefas) AS tasks,
 (SELECT count(*) FROM public.pedido_frentes) AS fronts,
 (SELECT count(*) FROM public.pedidos p WHERE NOT EXISTS(SELECT 1 FROM public.pedido_frentes f
   WHERE f.organization_id=p.organization_id AND f.pedido_id=p.id AND f.is_legacy_default)) AS orders_missing_general,
 (SELECT count(*) FROM public.tarefas WHERE frente_id IS NULL) AS tasks_missing_front,
 (SELECT count(*) FROM public.tarefas t WHERE t.frente_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.pedido_frentes f
   WHERE f.id=t.frente_id AND f.organization_id=t.organization_id AND f.pedido_id=t.pedido_id)) AS invalid_fronts,
 (SELECT count(*) FROM public.tarefas t WHERE responsavel_user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.organization_members m
   WHERE m.organization_id=t.organization_id AND m.user_id=t.responsavel_user_id)) AS invalid_assignees,
 (SELECT count(*) FROM public.tarefas WHERE responsavel IS NOT NULL AND responsavel_user_id IS NULL) AS unresolved_legacy_assignees,
 (SELECT count(*) FROM public.tarefas WHERE updated_at IS NULL) AS unknown_update_dates,
 (SELECT count(*) FROM public.subtarefas WHERE tarefa_id IS NULL) AS unattached_subtasks,
 (SELECT count(*) FROM public.comentarios_tarefa WHERE tarefa_id IS NULL) AS unattached_comments,
 (SELECT count(*) FROM public.tarefas WHERE status IS DISTINCT FROM CASE WHEN concluido THEN 'Concluída' ELSE 'Aberta' END) AS task_statuses_to_normalize,
 (SELECT count(*) FROM public.pedidos WHERE status IN('Ação Pendente','Aguardando Cliente','Prazo Concessionária','Concluído')) AS order_statuses_to_normalize,
 (SELECT count(*) FROM public.atividades a WHERE to_jsonb(a)->>'migration_key' IS NOT NULL) AS migration_activities;

SELECT status,count(*) FROM public.pedidos GROUP BY status ORDER BY status;
SELECT status,concluido,count(*) FROM public.tarefas GROUP BY status,concluido ORDER BY status,concluido;
SELECT status_mode,timeline_mode FROM private.pedidos_v1_rollout;

-- Compare ACL/policy fingerprints before/after. Both must stay identical.
SELECT c.relname,c.relrowsecurity,md5(coalesce(c.relacl::text,'')) AS acl_fingerprint,
 has_table_privilege('authenticated',c.oid,'TRUNCATE') AS authenticated_truncate,
 (SELECT md5(coalesce(string_agg(row_to_json(p)::text,'|' ORDER BY p.policyname),''))
  FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname) AS policy_fingerprint
FROM pg_class c WHERE c.oid IN('public.pedidos'::regclass,'public.tarefas'::regclass,
 'public.subtarefas'::regclass,'public.comentarios_tarefa'::regclass,'public.atividades'::regclass,'public.anexos'::regclass)
ORDER BY c.relname;

SELECT tgname,tgenabled FROM pg_trigger WHERE tgrelid='public.tarefas'::regclass AND NOT tgisinternal ORDER BY tgname;
SELECT p.oid::regprocedure AS routine,p.prosecdef,p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_proc p WHERE p.oid=to_regprocedure('private.backfill_pedidos_v1()');
SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='atividades_org_migration_key_uidx';
