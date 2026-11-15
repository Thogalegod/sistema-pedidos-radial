-- READ-ONLY. Execute after authorized M03 application, never as a backfill.
SELECT count(*) AS subtasks,
  count(*) FILTER(WHERE vencimento IS NOT NULL) AS with_due_date,
  count(*) FILTER(WHERE prioridade IS NOT NULL) AS with_priority
FROM public.subtarefas;

SELECT count(*) AS edges,
  count(*) FILTER(WHERE t.id IS NULL OR p.id IS NULL) AS invalid_endpoints,
  count(*) FILTER(WHERE d.tarefa_id=d.predecessora_id) AS self_edges
FROM public.tarefa_dependencias d
LEFT JOIN public.tarefas t ON t.organization_id=d.organization_id AND t.pedido_id=d.pedido_id AND t.id=d.tarefa_id
LEFT JOIN public.tarefas p ON p.organization_id=d.organization_id AND p.pedido_id=d.pedido_id AND p.id=d.predecessora_id;

-- UNION deduplicates reachability and terminates even if a privileged writer
-- has inserted a cycle outside the API. No path-array exponential expansion.
WITH RECURSIVE reach(organization_id,pedido_id,source_id,target_id) AS (
  SELECT organization_id,pedido_id,tarefa_id,predecessora_id FROM public.tarefa_dependencias
  UNION
  SELECT r.organization_id,r.pedido_id,r.source_id,d.predecessora_id
  FROM reach r JOIN public.tarefa_dependencias d
    ON d.organization_id=r.organization_id AND d.pedido_id=r.pedido_id AND d.tarefa_id=r.target_id
)
SELECT count(*) AS cycle_nodes FROM reach WHERE source_id=target_id;

SELECT r.role_name,p.privilege,has_table_privilege(r.role_name,'public.tarefa_dependencias',p.privilege) AS granted
FROM (VALUES('anon'),('authenticated'))r(role_name)
CROSS JOIN(VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN'))p(privilege);

SELECT c.relrowsecurity AS rls_enabled,
  NOT EXISTS(SELECT 1 FROM aclexplode(c.relacl)a WHERE a.grantee=0) AS public_has_no_grants
FROM pg_class c WHERE c.oid='public.tarefa_dependencias'::regclass;

SELECT conname,convalidated,pg_get_constraintdef(oid) AS definition FROM pg_constraint
WHERE conrelid='public.tarefa_dependencias'::regclass ORDER BY conname;

SELECT p.oid::regprocedure AS function_name,p.prosecdef,p.proconfig,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_proc p WHERE p.oid IN(
 'public.add_pedido_dependency(uuid,uuid,uuid)'::regprocedure,
 'public.remove_pedido_dependency(uuid,uuid,uuid)'::regprocedure,
 'private.lock_pedido_dependency_scope(uuid,uuid,uuid)'::regprocedure);
