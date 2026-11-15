-- Local disposable DB only. Ordinary mode checks the current database.
-- Transition proof: psql -v gate05_apply_m00=1 -f <this file> against the
-- pre-M00 database captures catalogs, applies the actual M00, and rolls back.
-- Never run this fixture-bearing test against IURQ/production.
\set ON_ERROR_STOP on
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

CREATE TEMP TABLE gate05_targets (name text PRIMARY KEY, needs_update boolean);
INSERT INTO gate05_targets VALUES
  ('pedidos', true), ('tarefas', true), ('subtarefas', true),
  ('comentarios_tarefa', false), ('atividades', false), ('anexos', false);

-- Capture actual catalogs, not SQL text, to detect an accidental broad REVOKE,
-- grants to anon, changed policies, columns, FKs or triggers on another table.
CREATE TEMP VIEW gate05_relation_state AS
SELECT c.oid, n.nspname, c.relname, c.relacl, c.relrowsecurity, c.relforcerowsecurity,
  (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attnum) FROM pg_attribute a
    WHERE a.attrelid=c.oid AND a.attnum>0) AS columns,
  (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.polname) FROM pg_policy p
    WHERE p.polrelid=c.oid) AS policies,
  (SELECT jsonb_agg(to_jsonb(k) ORDER BY k.conname) FROM pg_constraint k
    WHERE k.conrelid=c.oid) AS constraints,
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.tgname) FROM pg_trigger t
    WHERE t.tgrelid=c.oid) AS triggers
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','auth','storage');
CREATE TEMP TABLE gate05_before AS SELECT * FROM gate05_relation_state;

\if :{?gate05_apply_m00}
  \ir ../../migrations/20260923195900_pedidos_v1_baseline_privileges.sql
\endif

SELECT ok(NOT has_table_privilege('authenticated', format('public.%I',name), 'TRUNCATE'),
  name || ': authenticated has no TRUNCATE') FROM gate05_targets ORDER BY name;
SELECT ok(has_table_privilege('authenticated',format('public.%I',name),privilege),
  name || ': required ' || privilege || ' remains granted')
FROM gate05_targets CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) p(privilege)
WHERE privilege <> 'UPDATE' OR needs_update ORDER BY name, privilege;
SELECT ok(NOT has_table_privilege('anon',format('public.%I',name),privilege),
  name || ': anon has no ' || privilege)
FROM gate05_targets CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),
  ('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilege) ORDER BY name,privilege;
SELECT ok(c.relrowsecurity, t.name || ': RLS remains enabled')
FROM gate05_targets t JOIN pg_class c ON c.oid=format('public.%I',t.name)::regclass;

SELECT results_eq(
  $$SELECT to_jsonb(s) FROM gate05_relation_state s
    WHERE NOT (nspname='public' AND relname IN (SELECT name FROM gate05_targets)) ORDER BY oid$$,
  $$SELECT to_jsonb(s) FROM gate05_before s
    WHERE NOT (nspname='public' AND relname IN (SELECT name FROM gate05_targets)) ORDER BY oid$$,
  'every table outside scope retains its ACL, structure, policies and triggers');
SELECT results_eq(
  $$SELECT to_jsonb(s)-'relacl' FROM gate05_relation_state s ORDER BY oid$$,
  $$SELECT to_jsonb(s)-'relacl' FROM gate05_before s ORDER BY oid$$,
  'no table structure, RLS policy, constraint or trigger changes');
SELECT results_eq(
  $$SELECT s.oid, a.grantor, a.grantee, a.privilege_type, a.is_grantable
    FROM gate05_relation_state s CROSS JOIN LATERAL aclexplode(s.relacl) a
    WHERE NOT (s.nspname='public' AND s.relname IN (SELECT name FROM gate05_targets)
      AND a.grantee='authenticated'::regrole AND a.privilege_type='TRUNCATE')
    ORDER BY 1,2,3,4,5$$,
  $$SELECT s.oid, a.grantor, a.grantee, a.privilege_type, a.is_grantable
    FROM gate05_before s CROSS JOIN LATERAL aclexplode(s.relacl) a
    WHERE NOT (s.nspname='public' AND s.relname IN (SELECT name FROM gate05_targets)
      AND a.grantee='authenticated'::regrole AND a.privilege_type='TRUNCATE')
    ORDER BY 1,2,3,4,5$$,
  'only target authenticated TRUNCATE ACLs may change; anon and all other grants are identical');

\ir ../helpers/pedidos-v1-fixtures.sql

-- Test helpers execute as the current role, never SECURITY DEFINER.
CREATE FUNCTION pg_temp.check_crud() RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE
  relation_name text;
  inserted_id uuid;
  affected integer;
  actual_count integer;
  org_a constant uuid := '05000001-0000-4000-8000-000000000001';
  org_b constant uuid := '05000001-0000-4000-8000-000000000002';
  order_a constant uuid := '05000002-0000-4000-8000-000000000001';
  task_a constant uuid := '05000003-0000-4000-8000-000000000001';
  insert_sql text;
  update_set text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['pedidos','tarefas','subtarefas','comentarios_tarefa','atividades','anexos'] LOOP
    EXECUTE format('SELECT count(*)::int FROM public.%I WHERE organization_id=$1',relation_name) INTO actual_count USING org_a;
    RETURN NEXT is(actual_count, CASE WHEN relation_name='pedidos' THEN 2 ELSE 1 END,
      relation_name || ': common member reads own organization');
    EXECUTE format('SELECT count(*)::int FROM public.%I WHERE organization_id=$1',relation_name) INTO actual_count USING org_b;
    RETURN NEXT is(actual_count,0,relation_name || ': other organization is invisible');

    insert_sql := CASE relation_name
      WHEN 'pedidos' THEN format('INSERT INTO public.pedidos(organization_id,numero_pedido,projeto,cliente,endereco,prioridade,status) VALUES (%L,''QA-CRUD'',''QA'',''QA'',''QA'',''Normal'',''Ação Pendente'') RETURNING id',org_a)
      WHEN 'tarefas' THEN format('INSERT INTO public.tarefas(organization_id,pedido_id,descricao) VALUES (%L,%L,''QA-CRUD'') RETURNING id',org_a,order_a)
      WHEN 'subtarefas' THEN format('INSERT INTO public.subtarefas(organization_id,tarefa_id,descricao) VALUES (%L,%L,''QA-CRUD'') RETURNING id',org_a,task_a)
      WHEN 'comentarios_tarefa' THEN format('INSERT INTO public.comentarios_tarefa(organization_id,tarefa_id,texto,usuario) VALUES (%L,%L,''QA-CRUD'',''QA'') RETURNING id',org_a,task_a)
      WHEN 'atividades' THEN format('INSERT INTO public.atividades(organization_id,pedido_id,descricao,usuario) VALUES (%L,%L,''QA-CRUD'',''QA'') RETURNING id',org_a,order_a)
      WHEN 'anexos' THEN format('INSERT INTO public.anexos(organization_id,pedido_id,nome_arquivo,tipo,storage_path) VALUES (%L,%L,''qa-crud.pdf'',''application/pdf'',''qa-crud.pdf'') RETURNING id',org_a,order_a)
    END;
    RETURN NEXT throws_ok(replace(insert_sql,org_a::text,org_b::text), '42501', NULL,
      relation_name || ': cannot INSERT into another tenant');
    EXECUTE insert_sql INTO inserted_id;
    RETURN NEXT ok(inserted_id IS NOT NULL,relation_name || ': INSERT own row returns id');
    EXECUTE format('SELECT count(*)::int FROM public.%I WHERE id=$1',relation_name) INTO actual_count USING inserted_id;
    RETURN NEXT is(actual_count,1,relation_name || ': inserted row is readable');

    IF relation_name IN ('pedidos','tarefas','subtarefas') THEN
      update_set := CASE relation_name WHEN 'pedidos' THEN 'prioridade=''Alta'''
        WHEN 'tarefas' THEN 'concluido=true' ELSE 'concluida=true' END;
      EXECUTE format('UPDATE public.%I SET %s WHERE id=$1',relation_name,update_set) USING inserted_id;
      GET DIAGNOSTICS affected = ROW_COUNT;
      RETURN NEXT is(affected,1,relation_name || ': UPDATE own row succeeds');
      EXECUTE format('UPDATE public.%I SET %s WHERE organization_id=$1',relation_name,update_set) USING org_b;
      GET DIAGNOSTICS affected = ROW_COUNT;
      RETURN NEXT is(affected,0,relation_name || ': UPDATE another tenant affects zero rows');
      RETURN NEXT throws_ok(format('UPDATE public.%I SET organization_id=%L WHERE id=%L',relation_name,org_b,inserted_id),
        '42501',NULL,relation_name || ': WITH CHECK prevents moving a row to another tenant');
    END IF;

    EXECUTE format('DELETE FROM public.%I WHERE organization_id=$1',relation_name) USING org_b;
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN NEXT is(affected,0,relation_name || ': DELETE another tenant affects zero rows');
    EXECUTE format('DELETE FROM public.%I WHERE id=$1',relation_name) USING inserted_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN NEXT is(affected,1,relation_name || ': DELETE own row succeeds');
    EXECUTE format('SELECT count(*)::int FROM public.%I WHERE id=$1',relation_name) INTO actual_count USING inserted_id;
    RETURN NEXT is(actual_count,0,relation_name || ': deleted row is gone');
  END LOOP;
END;
$$;

SELECT set_config('request.jwt.claim.sub','05000000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"sub":"05000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT is(current_user::text,'authenticated','CRUD runs as authenticated, not the database owner');
SELECT * FROM pg_temp.check_crud();
RESET ROLE;

-- A second real identity proves the other tenant still exists after denied writes.
CREATE FUNCTION pg_temp.check_tenant_b() RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE relation_name text; actual_count integer;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['pedidos','tarefas','subtarefas','comentarios_tarefa','atividades','anexos'] LOOP
    EXECUTE format('SELECT count(*)::int FROM public.%I WHERE organization_id=%L',relation_name,'05000001-0000-4000-8000-000000000002') INTO actual_count;
    RETURN NEXT is(actual_count,1,relation_name || ': B retains its row after denied A writes');
    EXECUTE format('SELECT count(*)::int FROM public.%I WHERE organization_id=%L',relation_name,'05000001-0000-4000-8000-000000000001') INTO actual_count;
    RETURN NEXT is(actual_count,0,relation_name || ': B cannot read A');
  END LOOP;
END;
$$;
SELECT set_config('request.jwt.claim.sub','05000000-0000-4000-8000-000000000003',true);
SELECT set_config('request.jwt.claims','{"sub":"05000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT * FROM pg_temp.check_tenant_b();
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
