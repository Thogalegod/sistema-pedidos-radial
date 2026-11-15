-- Local disposable database only. All fixture data rolls back.
\set ON_ERROR_STOP on
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT no_plan();
\ir ../helpers/pedidos-v1-fixtures.sql
\ir ../helpers/pedidos-v1-dependency-fixtures.sql
CREATE TEMP TABLE subtasks_before AS SELECT id,to_jsonb(s) AS row FROM public.subtarefas s;
\if :{?dependencies_apply_m03}
  \ir ../../migrations/20260923200200_pedidos_v1_subtasks_dependencies.sql
\endif
SELECT has_table('public','tarefa_dependencias','Dependency relation exists');
SELECT has_column('public','subtarefas','vencimento','Subtask has optional due date');
SELECT has_column('public','subtarefas','prioridade','Subtask has optional priority');
SELECT to_regclass('public.tarefa_dependencias') IS NOT NULL AS ready \gset
\if :ready
SELECT results_eq($$SELECT id,to_jsonb(s)-ARRAY['vencimento','prioridade'] FROM public.subtarefas s ORDER BY id$$,$$SELECT id,row-ARRAY['vencimento','prioridade'] FROM subtasks_before ORDER BY id$$,'Existing subtasks preserved');
SELECT is((SELECT count(*)::int FROM public.tarefa_dependencias),0,'No automatic dependencies');
SELECT is((SELECT count(*)::int FROM public.subtarefas WHERE vencimento IS NOT NULL OR prioridade IS NOT NULL),0,'No invented dates or priorities');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.tarefa_dependencias'::regclass),'Dependency RLS enabled');
SELECT ok(has_table_privilege('authenticated','public.tarefa_dependencias','SELECT'),'Members may read dependencies');
SELECT ok(NOT has_table_privilege(role_name,'public.tarefa_dependencias',privilege),role_name||' cannot '||privilege)
FROM (VALUES('anon'),('authenticated'))r(role_name)
CROSS JOIN(VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN'))p(privilege)
WHERE role_name='anon' OR privilege<>'SELECT';
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE c.oid='public.tarefa_dependencias'::regclass AND a.grantee=0),'PUBLIC has no dependency grants');
SELECT ok(NOT has_function_privilege('anon',signature,'EXECUTE'),'anon cannot invoke '||signature)
FROM (VALUES('public.add_pedido_dependency(uuid,uuid,uuid)'),('public.remove_pedido_dependency(uuid,uuid,uuid)'))f(signature);
SELECT ok(NOT has_function_privilege('authenticated','private.lock_pedido_dependency_scope(uuid,uuid,uuid)','EXECUTE'),'Private lock helper is not an API');
SELECT set_config('request.jwt.claim.sub','05000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$UPDATE public.subtarefas SET vencimento='2026-10-01',prioridade='Alta' WHERE tarefa_id='05000003-0000-4000-8000-000000000001'$$,'Subtask fields can be set independently');
SELECT results_eq($$SELECT vencimento,prioridade FROM public.subtarefas WHERE tarefa_id='05000003-0000-4000-8000-000000000001'$$,$$SELECT '2026-10-01'::date,'Alta'::text$$,'Subtask fields round trip');
SELECT lives_ok(format('UPDATE public.subtarefas SET prioridade=%L WHERE tarefa_id=%L',value,'05000003-0000-4000-8000-000000000001'),'Priority accepted: '||value)
FROM(VALUES('Urgente'),('Alta'),('Normal'),('Baixa'))p(value);
SELECT throws_ok($$UPDATE public.subtarefas SET prioridade='Invalid' WHERE tarefa_id='05000003-0000-4000-8000-000000000001'$$,'23514',NULL,'Invalid subtask priority rejected');
SELECT lives_ok($$UPDATE public.subtarefas SET vencimento=NULL,prioridade=NULL,concluida=true WHERE tarefa_id='05000003-0000-4000-8000-000000000001'$$,'Optional fields can be cleared and subtask completed');
SELECT ok((SELECT NOT concluido AND status='Aberta' FROM public.tarefas WHERE id='05000003-0000-4000-8000-000000000001'),'All subtasks complete does not complete parent');
SELECT throws_ok($$SELECT public.add_pedido_dependency('05000001-0000-4000-8000-000000000001','05000003-0000-4000-8000-000000000001','05000003-0000-4000-8000-000000000001')$$,'23514',NULL,'Self dependency rejected');
SELECT lives_ok($$SELECT public.add_pedido_dependency('05000001-0000-4000-8000-000000000001','05000003-0000-4000-8000-000000000001','05000003-0000-4000-8000-000000000004')$$,'A can depend on C');
SELECT throws_ok($$SELECT public.add_pedido_dependency('05000001-0000-4000-8000-000000000001','05000003-0000-4000-8000-000000000001','05000003-0000-4000-8000-000000000004')$$,'23505',NULL,'Duplicate dependency rejected');
SELECT throws_ok($$SELECT public.add_pedido_dependency('05000001-0000-4000-8000-000000000001','05000003-0000-4000-8000-000000000004','05000003-0000-4000-8000-000000000001')$$,'23514',NULL,'Two-node cycle rejected');
SELECT lives_ok($$SELECT public.add_pedido_dependency('05000001-0000-4000-8000-000000000001','05000003-0000-4000-8000-000000000004','05000003-0000-4000-8000-000000000005')$$,'C can depend on D');
SELECT throws_ok($$SELECT public.add_pedido_dependency('05000001-0000-4000-8000-000000000001','05000003-0000-4000-8000-000000000005','05000003-0000-4000-8000-000000000001')$$,'23514',NULL,'Three-node cycle rejected');
SELECT throws_ok(format('SELECT public.add_pedido_dependency(%L,%L,%L)','05000001-0000-4000-8000-000000000001','05000003-0000-4000-8000-000000000001',bad_id),'23503',NULL,label)
FROM(VALUES('05000003-0000-4000-8000-000000000006','Other order rejected'),('05000003-0000-4000-8000-000000000003','Other tenant rejected'),('05000003-0000-4000-8000-000000000099','Orphan rejected'))q(bad_id,label);
SELECT throws_ok($$SELECT public.add_pedido_dependency('05000001-0000-4000-8000-000000000002','05000003-0000-4000-8000-000000000003','05000003-0000-4000-8000-000000000001')$$,'42501',NULL,'Forged org parameter rejected');
SELECT throws_ok($$INSERT INTO public.tarefa_dependencias(organization_id,pedido_id,tarefa_id,predecessora_id) VALUES('05000001-0000-4000-8000-000000000001','05000002-0000-4000-8000-000000000001','05000003-0000-4000-8000-000000000005','05000003-0000-4000-8000-000000000001')$$,'42501',NULL,'Direct writes cannot bypass cycle checks');
SELECT throws_ok($$DELETE FROM public.tarefa_dependencias$$,'42501',NULL,'Direct deletes require RPC');
SELECT lives_ok($$SELECT public.remove_pedido_dependency('05000001-0000-4000-8000-000000000001','05000003-0000-4000-8000-000000000001','05000003-0000-4000-8000-000000000004')$$,'Own dependency can be removed');
SELECT is((SELECT count(*)::int FROM public.tarefa_dependencias),1,'Only selected edge removed');
SELECT lives_ok($$SELECT public.remove_pedido_dependency('05000001-0000-4000-8000-000000000001','05000003-0000-4000-8000-000000000001','05000003-0000-4000-8000-000000000004')$$,'Repeated removal is harmless');
SELECT lives_ok($$SELECT public.add_pedido_dependency('05000001-0000-4000-8000-000000000001','05000003-0000-4000-8000-000000000001','05000003-0000-4000-8000-000000000004')$$,'Removed edge can be re-added');
RESET ROLE;
-- Composite FKs protect integrity even for privileged SQL outside API grants.
SELECT throws_ok($$INSERT INTO public.tarefa_dependencias VALUES('05000001-0000-4000-8000-000000000001','05000002-0000-4000-8000-000000000001','05000003-0000-4000-8000-000000000001','05000003-0000-4000-8000-000000000006')$$,'23503',NULL,'Composite FK rejects cross-order predecessor');
SELECT throws_ok($$INSERT INTO public.tarefa_dependencias VALUES('05000001-0000-4000-8000-000000000001','05000002-0000-4000-8000-000000000001','05000003-0000-4000-8000-000000000003','05000003-0000-4000-8000-000000000001')$$,'23503',NULL,'Composite FK rejects cross-tenant source');
SELECT set_config('request.jwt.claim.sub','05000000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM public.tarefa_dependencias),0,'B cannot read A graph');
SELECT throws_ok($$SELECT public.remove_pedido_dependency('05000001-0000-4000-8000-000000000001','05000003-0000-4000-8000-000000000001','05000003-0000-4000-8000-000000000004')$$,'42501',NULL,'B cannot remove A edge');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','05000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM public.tarefa_dependencias),2,'A graph unchanged after denied B writes');
SELECT lives_ok($$DELETE FROM public.tarefas WHERE id='05000003-0000-4000-8000-000000000005'$$,'Deleting predecessor cascades its edges');
SELECT is((SELECT count(*)::int FROM public.tarefa_dependencias),1,'Unrelated edge preserved on predecessor deletion');
SELECT lives_ok($$DELETE FROM public.tarefas WHERE id='05000003-0000-4000-8000-000000000001'$$,'Deleting dependent cascades its edges');
SELECT is((SELECT count(*)::int FROM public.tarefa_dependencias),0,'No orphan edges remain');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.add_pedido_dependency('05000001-0000-4000-8000-000000000001','05000003-0000-4000-8000-000000000004','05000003-0000-4000-8000-000000000006')$$,'42501',NULL,'Real identity required');
RESET ROLE;
\endif
SELECT * FROM finish();
ROLLBACK;
