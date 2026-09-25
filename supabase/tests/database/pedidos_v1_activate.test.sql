-- Disposable local DB only. Exercises M06 canonical-status cutover inside rollback.
\set ON_ERROR_STOP on
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT no_plan();
INSERT INTO auth.users(id) VALUES
  ('05000000-0000-4000-8000-000000000001'),
  ('05000000-0000-4000-8000-000000000002'),
  ('05000000-0000-4000-8000-000000000003');
INSERT INTO public.organizations(id,name,slug) VALUES
  ('05000001-0000-4000-8000-000000000001','Pedidos activate A','pedidos-v1-activate-a'),
  ('05000001-0000-4000-8000-000000000002','Pedidos activate B','pedidos-v1-activate-b');
INSERT INTO public.organization_members(organization_id,user_id,role) VALUES
  ('05000001-0000-4000-8000-000000000001','05000000-0000-4000-8000-000000000001','admin'),
  ('05000001-0000-4000-8000-000000000001','05000000-0000-4000-8000-000000000002','member'),
  ('05000001-0000-4000-8000-000000000002','05000000-0000-4000-8000-000000000003','member');

SELECT is((SELECT status_mode FROM private.pedidos_v1_rollout WHERE singleton),'v1','Task status capability is active');
SELECT ok(EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.tarefas'::regclass
  AND tgname='tarefas_sync_canonical_state' AND tgenabled<>'D'),'Canonical task projection trigger is enabled');
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.tarefas'::regclass
  AND tgname='tarefas_sync_legacy_state' AND NOT tgisinternal),'Legacy projection trigger is removed');
SELECT ok(has_table_privilege('authenticated','public.pedidos','SELECT'),'Authenticated keeps Pedido read access');
SELECT ok(has_table_privilege('authenticated','public.pedidos','DELETE'),'Authenticated keeps protected Pedido delete access');
SELECT ok(NOT has_table_privilege('authenticated','public.pedidos','INSERT'),'Direct Pedido insert is revoked');
SELECT ok(NOT has_column_privilege('authenticated','public.pedidos','status','UPDATE'),'Direct Pedido status update is revoked');
SELECT ok(has_table_privilege('authenticated','public.tarefas','SELECT'),'Authenticated keeps task read access');
SELECT ok(NOT has_table_privilege('authenticated','public.tarefas','INSERT'),'Direct task insert is revoked');
SELECT ok(NOT has_column_privilege('authenticated','public.tarefas','concluido','UPDATE'),'Legacy bool update is revoked');
SELECT ok(NOT has_table_privilege('authenticated','public.tarefas','DELETE'),'Direct task delete is revoked');
SELECT is((SELECT count(*)::int FROM public.tarefas
  WHERE concluido IS DISTINCT FROM (status='Concluída')),0,'Task bool is a canonical status projection');
SELECT is((SELECT count(*)::int FROM public.pedidos
  WHERE status IN('Ação Pendente','Concluído')),0,'Legacy Pedido statuses are reconciled');

UPDATE public.organization_members SET display_name='Membro QA'
WHERE organization_id='05000001-0000-4000-8000-000000000001'
  AND user_id='05000000-0000-4000-8000-000000000002';
SELECT set_config('request.jwt.claim.sub','05000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;

SELECT public.create_pedido('05000001-0000-4000-8000-000000000001',jsonb_build_object(
  'number','ACT-1','title','Pedido V1','client','Cliente QA','address','Rua QA',
  'legacyPriority','Normal','utilityDueDate',NULL
)) AS active_order \gset
SELECT is((SELECT status FROM public.pedidos WHERE id=:'active_order'),'Em andamento','New Pedido uses canonical active status');
SELECT public.create_pedido_task('05000001-0000-4000-8000-000000000001',jsonb_build_object(
  'title','Tarefa V1','orderId',:'active_order','frontId',NULL
)) AS active_task \gset
SELECT ok((SELECT status='Aberta' AND NOT concluido AND concluida_em IS NULL
  FROM public.tarefas WHERE id=:'active_task'),'New task starts open with synchronized projection');

SELECT throws_ok(format(
  'SELECT public.update_pedido_task(%L,%L,%L::jsonb)',
  '05000001-0000-4000-8000-000000000001',:'active_task',
  '{"status":"Concluída","completed":false}'
),'22023',NULL,'Command rejects legacy bool even beside canonical status');
SELECT throws_ok(format('UPDATE public.tarefas SET concluido=true WHERE id=%L',:'active_task'),
  '42501',NULL,'Old client cannot update completion bool directly');
SELECT throws_ok(format(
  'UPDATE public.pedidos SET status=%L WHERE id=%L','Finalizado',:'active_order'
),'42501',NULL,'Old client cannot update Pedido status directly');

SELECT public.update_pedido_task(
  '05000001-0000-4000-8000-000000000001',:'active_task',
  '{"status":"Aguardando","waiting":{"type":"customer","userId":null,"note":"Cliente"}}'::jsonb
) AS waiting_task \gset
SELECT is(:'waiting_task'::jsonb->>'status','Aguardando','Task enters waiting through command');
SELECT ok((SELECT status='Aguardando' AND NOT concluido AND waiting_type='customer'
  FROM public.tarefas WHERE id=:'active_task'),'Customer waiting is stored with open projection');
SELECT lives_ok(format(
  'SELECT public.update_pedido_task(%L,%L,%L::jsonb)',
  '05000001-0000-4000-8000-000000000001',:'active_task','{"title":"Ainda aguardando"}'
),'Unrelated edit preserves waiting details');
SELECT ok((SELECT waiting_type='customer' AND waiting_note='Cliente'
  FROM public.tarefas WHERE id=:'active_task'),'Existing waiting details remain intact');

SELECT lives_ok(format(
  'SELECT public.update_pedido_task(%L,%L,%L::jsonb)',
  '05000001-0000-4000-8000-000000000001',:'active_task',
  '{"waiting":{"type":"utility","userId":null,"note":"Concessionária"}}'
),'Utility waiting is accepted');
SELECT lives_ok(format(
  'SELECT public.update_pedido_task(%L,%L,%L::jsonb)',
  '05000001-0000-4000-8000-000000000001',:'active_task',
  '{"waiting":{"type":"supplier","userId":null,"note":"Fornecedor"}}'
),'Supplier waiting is accepted');
SELECT lives_ok(format(
  'SELECT public.update_pedido_task(%L,%L,%L::jsonb)',
  '05000001-0000-4000-8000-000000000001',:'active_task',
  '{"waiting":{"type":"other","userId":null,"note":"Outro"}}'
),'Other waiting is accepted');
SELECT lives_ok(format(
  'SELECT public.update_pedido_task(%L,%L,%L::jsonb)',
  '05000001-0000-4000-8000-000000000001',:'active_task',
  jsonb_build_object('waiting',jsonb_build_object(
    'type','internal_user','userId','05000000-0000-4000-8000-000000000002','note','Interno'))::text
),'Internal member waiting is accepted');

SELECT public.update_pedido_task(
  '05000001-0000-4000-8000-000000000001',:'active_task',
  '{"status":"Em andamento","priority":"Urgente"}'::jsonb
) AS progressing_task \gset
SELECT ok((SELECT status='Em andamento' AND prioridade='Urgente' AND NOT concluido
  AND waiting_type IS NULL AND waiting_user_id IS NULL AND waiting_note IS NULL
  FROM public.tarefas WHERE id=:'active_task'),'Progress clears waiting and preserves independent priority');
SELECT public.update_pedido_task(
  '05000001-0000-4000-8000-000000000001',:'active_task','{"status":"Concluída"}'::jsonb
) AS completed_task \gset
SELECT ok((SELECT status='Concluída' AND concluido AND concluida_em IS NOT NULL
  FROM public.tarefas WHERE id=:'active_task'),'Canonical completion synchronizes bool and timestamp');
SELECT is((SELECT status FROM public.pedidos WHERE id=:'active_order'),'Em andamento','Task completion never finalizes Pedido');
SELECT public.update_pedido_task(
  '05000001-0000-4000-8000-000000000001',:'active_task','{"status":"Aberta"}'::jsonb
) AS reopened_task \gset
SELECT ok((SELECT status='Aberta' AND NOT concluido AND concluida_em IS NULL
  FROM public.tarefas WHERE id=:'active_task'),'Canonical reopen clears completion projection');

SELECT lives_ok(format('SELECT public.set_pedido_status(%L,%L,%L)',
  '05000001-0000-4000-8000-000000000001',:'active_order','Finalizado'),'Explicit finalization succeeds in V1');
SELECT throws_ok(format(
  'SELECT public.create_pedido_task(%L,%L::jsonb)',
  '05000001-0000-4000-8000-000000000001',
  jsonb_build_object('title','Blocked','orderId',:'active_order','frontId',NULL)::text
),'23514',NULL,'Finalized Pedido rejects new task');
SELECT lives_ok(format('SELECT public.set_pedido_status(%L,%L,%L)',
  '05000001-0000-4000-8000-000000000001',:'active_order','Em andamento'),'Finalized Pedido reopens explicitly');
SELECT lives_ok(format('SELECT public.set_pedido_status(%L,%L,%L)',
  '05000001-0000-4000-8000-000000000001',:'active_order','Cancelado'),'Explicit cancellation succeeds in V1');
SELECT throws_ok(format(
  'SELECT public.update_pedido_task(%L,%L,%L::jsonb)',
  '05000001-0000-4000-8000-000000000001',:'active_task','{"title":"Blocked"}'
),'23514',NULL,'Cancelled Pedido rejects task update');
SELECT lives_ok(format('SELECT public.set_pedido_status(%L,%L,%L)',
  '05000001-0000-4000-8000-000000000001',:'active_order','Em andamento'),'Cancelled Pedido reopens explicitly');

RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.tarefas
  WHERE concluido IS DISTINCT FROM (status='Concluída')),0,'Projection remains synchronized after all transitions');
SELECT * FROM finish();
ROLLBACK;
