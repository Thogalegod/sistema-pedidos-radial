-- READ-ONLY. Run before and after M00; compare the results.
-- Never executes TRUNCATE, reads business rows or changes permissions.
-- Expected after M00: authenticated TRUNCATE=false on exactly these six;
-- all other grant/RLS values and the outside-scope fingerprint unchanged.
WITH targets(name, needs_update) AS (
  VALUES ('pedidos',true), ('tarefas',true), ('subtarefas',true),
    ('comentarios_tarefa',false), ('atividades',false), ('anexos',false)
)
SELECT t.name AS table_name, c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select,
  has_table_privilege('authenticated',c.oid,'INSERT') AS authenticated_insert,
  has_table_privilege('authenticated',c.oid,'UPDATE') AS authenticated_update,
  has_table_privilege('authenticated',c.oid,'DELETE') AS authenticated_delete,
  has_table_privilege('authenticated',c.oid,'TRUNCATE') AS authenticated_truncate,
  has_table_privilege('authenticated',c.oid,'REFERENCES') AS authenticated_references,
  has_table_privilege('authenticated',c.oid,'TRIGGER') AS authenticated_trigger,
  NOT has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS anon_has_no_privileges,
  (has_table_privilege('authenticated',c.oid,'SELECT')
    AND has_table_privilege('authenticated',c.oid,'INSERT')
    AND has_table_privilege('authenticated',c.oid,'DELETE')
    AND (NOT t.needs_update OR has_table_privilege('authenticated',c.oid,'UPDATE'))) AS required_crud_granted,
  (SELECT md5(coalesce(string_agg(to_jsonb(p)::text, '|' ORDER BY p.polname),''))
    FROM pg_policy p WHERE p.polrelid=c.oid) AS policies_fingerprint
FROM targets t JOIN pg_class c ON c.oid=format('public.%I',t.name)::regclass
ORDER BY t.name;

-- Local/remote before-vs-after comparison on the same database only.
-- No business data; names/ACLs/RLS from catalogs, aggregated to one fingerprint.
SELECT count(*) AS other_table_count,
  md5(coalesce(string_agg(
    jsonb_build_array(n.nspname,c.relname,c.relacl,c.relrowsecurity,c.relforcerowsecurity)::text,
    '|' ORDER BY n.nspname,c.relname),'')) AS other_tables_acl_rls_fingerprint
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','auth','storage')
  AND NOT (n.nspname='public' AND c.relname IN
    ('pedidos','tarefas','subtarefas','comentarios_tarefa','atividades','anexos'));
