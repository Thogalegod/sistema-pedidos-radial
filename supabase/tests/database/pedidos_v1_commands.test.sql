-- Disposable local DB only. Exercises M05 command boundaries inside rollback.
\set ON_ERROR_STOP on
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT no_plan();
\ir ../helpers/pedidos-v1-fixtures.sql

SELECT has_function('public','create_pedido',ARRAY['uuid','jsonb'],'Scoped order create command exists');
SELECT has_function('public','update_pedido',ARRAY['uuid','uuid','jsonb'],'Scoped order update command exists');
SELECT has_function('public','create_pedido_task',ARRAY['uuid','jsonb'],'Scoped task create command exists');
SELECT has_function('public','update_pedido_task',ARRAY['uuid','uuid','jsonb'],'Scoped task update command exists');
SELECT has_function('public','set_pedido_status',ARRAY['uuid','uuid','text'],'Explicit order status command exists');
SELECT has_function('public','save_pedido_subtask',ARRAY['uuid','jsonb'],'Scoped subtask command exists');
SELECT has_function('public','remove_pedido_task',ARRAY['uuid','uuid'],'Scoped task removal command exists');
SELECT has_function('public','remove_pedido_front',ARRAY['uuid','uuid','uuid'],'Atomic front removal command exists');

SELECT to_regprocedure('public.create_pedido(uuid,jsonb)') IS NOT NULL AS ready \gset
\if :ready
SELECT ok(NOT has_function_privilege('anon',signature,'EXECUTE'),'anon cannot invoke '||signature)
FROM (VALUES
  ('public.create_pedido(uuid,jsonb)'),
  ('public.update_pedido(uuid,uuid,jsonb)'),
  ('public.create_pedido_task(uuid,jsonb)'),
  ('public.update_pedido_task(uuid,uuid,jsonb)'),
  ('public.set_pedido_status(uuid,uuid,text)'),
  ('public.save_pedido_subtask(uuid,jsonb)'),
  ('public.remove_pedido_task(uuid,uuid)'),
  ('public.remove_pedido_front(uuid,uuid,uuid)')
)f(signature);
SELECT ok(NOT has_function_privilege(role_name,'private.record_pedido_task_event(uuid,uuid,text,text)','EXECUTE'),role_name||' cannot invoke private event writer')
FROM (VALUES('anon'),('authenticated'))r(role_name);

UPDATE public.organization_members SET display_name='Membro QA'
WHERE organization_id='05000001-0000-4000-8000-000000000001'
  AND user_id='05000000-0000-4000-8000-000000000002';
SELECT set_config('request.jwt.claim.sub','05000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;

SELECT public.create_pedido('05000001-0000-4000-8000-000000000001',jsonb_build_object(
  'number','CMD-1','title','Pedido comando','client','Cliente QA','address','Rua QA',
  'legacyPriority','Alta','utilityDueDate',NULL,'cep','12345-678'
)) AS created_order \gset
SELECT ok((SELECT created_by='05000000-0000-4000-8000-000000000002'::uuid
  FROM public.pedidos WHERE id=:'created_order'),'Order creator comes from auth.uid');
SELECT is((SELECT status FROM public.pedidos WHERE id=:'created_order'),'Ação Pendente','Legacy phase stores compatible initial order status');
SELECT throws_ok(format(
  'SELECT public.create_pedido(%L,%L::jsonb)',
  '05000001-0000-4000-8000-000000000001',
  '{"number":"X","title":"X","client":"X","address":"X","legacyPriority":"Normal","utilityDueDate":null,"unexpected":true}'
),'22023',NULL,'Order command rejects extra keys');
SELECT throws_ok($$SELECT public.update_pedido(
  '05000001-0000-4000-8000-000000000001',
  '05000002-0000-4000-8000-000000000003',
  '{"title":"Cross tenant"}'::jsonb)$$,'23503',NULL,'Order update cannot cross tenants');
SELECT lives_ok(format(
  'SELECT public.update_pedido(%L,%L,%L::jsonb)',
  '05000001-0000-4000-8000-000000000001',:'created_order','{"title":"Pedido atualizado"}'
),'Order patch succeeds');
SELECT is((SELECT projeto FROM public.pedidos WHERE id=:'created_order'),'Pedido atualizado','Order patch maps camelCase explicitly');

SELECT public.create_pedido_task('05000001-0000-4000-8000-000000000001',jsonb_build_object(
  'title','Tarefa única','orderId',:'created_order','frontId',NULL,
  'assigneeId','05000000-0000-4000-8000-000000000002','dueDate','2026-10-01'
)) AS created_task \gset
SELECT ok((SELECT created_by='05000000-0000-4000-8000-000000000002'::uuid
  AND responsavel_user_id='05000000-0000-4000-8000-000000000002'::uuid
  AND frente_id IS NOT NULL AND status='Aberta' AND NOT concluido
  FROM public.tarefas WHERE id=:'created_task'),'Task defaults, identity and General front are server-owned');
SELECT throws_ok(format(
  'SELECT public.create_pedido_task(%L,%L::jsonb)',
  '05000001-0000-4000-8000-000000000001',
  jsonb_build_object('title','Invalid assignee','orderId',:'created_order','frontId',NULL,
    'assigneeId','05000000-0000-4000-8000-000000000003')::text
),'23503',NULL,'Task assignee must be a member of the same tenant');

SELECT public.update_pedido_task(
  '05000001-0000-4000-8000-000000000001',:'created_task','{"status":"Concluída"}'::jsonb
) AS completed_task \gset
SELECT is(:'completed_task'::jsonb->>'status','Concluída','Task command returns canonical task data');
SELECT ok((SELECT concluido AND concluida_em IS NOT NULL FROM public.tarefas WHERE id=:'created_task'),'Legacy projection follows task command');
SELECT is((SELECT status FROM public.pedidos WHERE id=:'created_order'),'Ação Pendente','Completing the last task never finalizes the order');
SELECT is((SELECT count(*)::int FROM public.atividades
  WHERE pedido_id=:'created_order' AND migration_key LIKE 'system:%'),4,'Create/update operations write system history');

SELECT lives_ok(format(
  'SELECT public.set_pedido_status(%L,%L,%L)',
  '05000001-0000-4000-8000-000000000001',:'created_order','Finalizado'
),'Explicit finalization succeeds');
SELECT is((SELECT status FROM public.pedidos WHERE id=:'created_order'),'Concluído','Legacy phase maps explicit finalization');
SELECT throws_ok(format(
  'SELECT public.create_pedido_task(%L,%L::jsonb)',
  '05000001-0000-4000-8000-000000000001',
  jsonb_build_object('title','Blocked','orderId',:'created_order','frontId',NULL)::text
),'23514',NULL,'Closed order rejects a new task');
SELECT lives_ok(format(
  'SELECT public.set_pedido_status(%L,%L,%L)',
  '05000001-0000-4000-8000-000000000001',:'created_order','Em andamento'
),'Explicit reopen succeeds');
SELECT is((SELECT status FROM public.pedidos WHERE id=:'created_order'),'Ação Pendente','Legacy phase maps explicit reopen');
SELECT lives_ok(format(
  'SELECT public.set_pedido_status(%L,%L,%L)',
  '05000001-0000-4000-8000-000000000001',:'created_order','Cancelado'
),'Explicit cancellation succeeds');
SELECT is((SELECT status FROM public.pedidos WHERE id=:'created_order'),'Cancelado','Cancellation remains canonical in legacy phase');
SELECT lives_ok(format(
  'SELECT public.set_pedido_status(%L,%L,%L)',
  '05000001-0000-4000-8000-000000000001',:'created_order','Em andamento'
),'Cancelled order can be explicitly reopened');

SELECT lives_ok(format(
  'SELECT public.save_pedido_subtask(%L,%L::jsonb)',
  '05000001-0000-4000-8000-000000000001',
  jsonb_build_object('id',NULL,'taskId',:'created_task','patch',jsonb_build_object('title','Sub QA'))::text
),'Subtask create succeeds');
SELECT id AS created_subtask FROM public.subtarefas
WHERE organization_id='05000001-0000-4000-8000-000000000001'
  AND tarefa_id=:'created_task' AND descricao='Sub QA' \gset
SELECT lives_ok(format(
  'SELECT public.save_pedido_subtask(%L,%L::jsonb)',
  '05000001-0000-4000-8000-000000000001',
  jsonb_build_object('id',:'created_subtask','taskId',:'created_task','patch',jsonb_build_object('completed',true))::text
),'Subtask completion succeeds');
SELECT ok((SELECT concluida FROM public.subtarefas WHERE id=:'created_subtask'),'Subtask is completed');
SELECT ok((SELECT concluido FROM public.tarefas WHERE id=:'created_task'),'Subtask command does not change parent completion');

INSERT INTO public.pedido_frentes(id,organization_id,pedido_id,nome,ordem)
VALUES
  ('05000007-0000-4000-8000-000000000010','05000001-0000-4000-8000-000000000001',:'created_order','Origem',1),
  ('05000007-0000-4000-8000-000000000011','05000001-0000-4000-8000-000000000001',:'created_order','Destino',2);
UPDATE public.tarefas SET frente_id='05000007-0000-4000-8000-000000000010' WHERE id=:'created_task';
SELECT throws_ok($$SELECT public.remove_pedido_front(
  '05000001-0000-4000-8000-000000000001',
  '05000007-0000-4000-8000-000000000010',
  '05000007-0000-4000-8000-000000000099')$$,'23503',NULL,'Invalid destination aborts front removal');
SELECT ok((SELECT frente_id='05000007-0000-4000-8000-000000000010'::uuid FROM public.tarefas WHERE id=:'created_task'),'Failed front move leaves task unchanged');
SELECT lives_ok($$SELECT public.remove_pedido_front(
  '05000001-0000-4000-8000-000000000001',
  '05000007-0000-4000-8000-000000000010',
  '05000007-0000-4000-8000-000000000011')$$,'Valid front move succeeds');
SELECT ok((SELECT frente_id='05000007-0000-4000-8000-000000000011'::uuid FROM public.tarefas WHERE id=:'created_task'),'Tasks move before source front is removed');
SELECT ok(NOT EXISTS(SELECT 1 FROM public.pedido_frentes WHERE id='05000007-0000-4000-8000-000000000010'),'Source front is removed');

SELECT throws_ok(format(
  'INSERT INTO public.atividades(organization_id,pedido_id,descricao,usuario,migration_key) VALUES(%L,%L,%L,%L,%L)',
  '05000001-0000-4000-8000-000000000001',:'created_order','Forged','QA','system:forged'
),'42501',NULL,'Client cannot forge system history');
INSERT INTO public.atividades(organization_id,pedido_id,descricao,usuario)
VALUES('05000001-0000-4000-8000-000000000001',:'created_order','Manual QA','Membro QA')
RETURNING id AS manual_activity \gset
SELECT lives_ok(format('DELETE FROM public.atividades WHERE id=%L',:'manual_activity'),'Manual history remains deletable');
SELECT id AS system_activity FROM public.atividades
WHERE pedido_id=:'created_order' AND migration_key LIKE 'system:%' ORDER BY criado_em LIMIT 1 \gset
SELECT throws_ok(format('DELETE FROM public.atividades WHERE id=%L',:'system_activity'),'42501',NULL,'Client cannot delete system history');

SELECT lives_ok(format(
  'SELECT public.remove_pedido_task(%L,%L)',
  '05000001-0000-4000-8000-000000000001',:'created_task'
),'Task removal succeeds while order is active');
SELECT ok(NOT EXISTS(SELECT 1 FROM public.tarefas WHERE id=:'created_task'),'Target task is removed');
SELECT ok(EXISTS(SELECT 1 FROM public.pedidos WHERE id=:'created_order'),'Task removal preserves parent order');
SELECT ok(EXISTS(SELECT 1 FROM public.atividades WHERE pedido_id=:'created_order' AND migration_key LIKE 'system:%'),'Task removal preserves system history');

SELECT throws_ok($$SELECT public.set_pedido_status(
  '05000001-0000-4000-8000-000000000002',
  '05000002-0000-4000-8000-000000000003','Finalizado')$$,'42501',NULL,'Member A cannot mutate tenant B');
RESET ROLE;
\endif
SELECT * FROM finish();
ROLLBACK;
