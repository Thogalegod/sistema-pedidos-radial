-- READ-ONLY. Run after separately authorized M02 application in IURQ.
-- Aggregates only: no names, email addresses or metadata values.
SELECT status,count(*) AS task_count,count(*) FILTER(WHERE updated_at IS NULL) AS unknown_updated_at
FROM public.tarefas GROUP BY status ORDER BY status NULLS FIRST;

SELECT count(*) FILTER(WHERE t.responsavel_user_id IS NULL) AS unresolved_assignees,
  count(*) FILTER(WHERE t.responsavel_user_id IS NOT NULL AND m.user_id IS NULL) AS invalid_assignees
FROM public.tarefas t LEFT JOIN public.organization_members m
  ON m.organization_id=t.organization_id AND m.user_id=t.responsavel_user_id;

SELECT count(*) AS invalid_waits FROM public.tarefas t
WHERE (t.status='Aguardando' AND t.waiting_type IS NULL)
  OR (t.waiting_type='internal_user' AND (t.waiting_user_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id=t.organization_id AND m.user_id=t.waiting_user_id)))
  OR (t.waiting_type IS DISTINCT FROM 'internal_user' AND t.waiting_user_id IS NOT NULL)
  OR (t.waiting_type IS NOT NULL AND t.waiting_type NOT IN('customer','utility','supplier','internal_user','other'));

SELECT count(*) AS members,count(*) FILTER(WHERE display_name IS NULL) AS unnamed_members
FROM public.organization_members;

SELECT singleton,status_mode,timeline_mode FROM private.pedidos_v1_rollout;
SELECT r.role_name,p.privilege,
  has_table_privilege(r.role_name,'private.pedidos_v1_rollout',p.privilege) AS granted
FROM (VALUES('anon'),('authenticated'))r(role_name)
CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN'))p(privilege);

SELECT c.relrowsecurity AS rls_enabled,
  NOT EXISTS(SELECT 1 FROM aclexplode(c.relacl)a WHERE a.grantee=0) AS public_has_no_grants
FROM pg_class c WHERE c.oid='private.pedidos_v1_rollout'::regclass;

SELECT has_table_privilege('authenticated','public.organization_members','SELECT') AS membership_select,
  has_table_privilege('authenticated','public.organization_members','UPDATE') AS membership_update,
  has_table_privilege('authenticated','public.organization_members','TRUNCATE') AS membership_truncate;

SELECT p.oid::regprocedure AS function_name,p.prosecdef,p.proconfig,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_proc p WHERE p.oid IN(
  'public.list_pedido_members(uuid)'::regprocedure,
  'public.set_pedido_member_display_name(uuid,uuid,text)'::regprocedure,
  'public.assign_legacy_pedido_tasks(uuid,uuid[],uuid)'::regprocedure,
  'public.pedidos_v1_capabilities(uuid)'::regprocedure);

SELECT conname,convalidated,pg_get_constraintdef(oid) AS definition FROM pg_constraint
WHERE conrelid='public.tarefas'::regclass
  AND conname IN('tarefas_responsavel_member_fkey','tarefas_waiting_member_fkey','tarefas_waiting_required_check','tarefas_waiting_user_check');
