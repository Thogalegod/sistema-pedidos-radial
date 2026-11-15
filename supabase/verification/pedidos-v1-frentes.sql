-- READ-ONLY, after authorized M01 application. Old NULL fronts are allowed.
SELECT p.id AS pedido_id, count(DISTINCT f.id) AS front_count,
  count(DISTINCT f.id) FILTER (WHERE f.is_legacy_default) AS default_front_count
FROM public.pedidos p LEFT JOIN public.pedido_frentes f
  ON f.organization_id=p.organization_id AND f.pedido_id=p.id
GROUP BY p.id ORDER BY p.id;

SELECT count(*) FILTER (WHERE t.frente_id IS NULL) AS legacy_tasks_without_front,
  count(*) FILTER (WHERE t.frente_id IS NOT NULL AND f.id IS NULL) AS invalid_front_links
FROM public.tarefas t LEFT JOIN public.pedido_frentes f
  ON f.organization_id=t.organization_id AND f.pedido_id=t.pedido_id AND f.id=t.frente_id;

SELECT r.role_name, p.privilege,
  has_table_privilege(r.role_name,'public.pedido_frentes',p.privilege) AS granted
FROM (VALUES ('anon'),('authenticated')) r(role_name)
CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege)
ORDER BY r.role_name,p.privilege;

SELECT c.relrowsecurity AS rls_enabled,
  NOT EXISTS (SELECT 1 FROM aclexplode(c.relacl) a WHERE a.grantee=0) AS public_has_no_grants
FROM pg_class c WHERE c.oid='public.pedido_frentes'::regclass;

SELECT conname,convalidated,condeferrable,condeferred
FROM pg_constraint WHERE conrelid='public.tarefas'::regclass
  AND conname='tarefas_frente_org_pedido_fkey';

-- Both roles must remain unable to call the private implementation directly.
SELECT role_name,
  has_schema_privilege(role_name,'private','USAGE') AS private_schema_usage,
  has_function_privilege(role_name,'private.ensure_pedido_default_front(uuid,uuid)','EXECUTE') AS helper_execute,
  has_function_privilege(role_name,'private.assign_legacy_pedido_front()','EXECUTE') AS trigger_execute
FROM (VALUES ('anon'),('authenticated')) r(role_name);
