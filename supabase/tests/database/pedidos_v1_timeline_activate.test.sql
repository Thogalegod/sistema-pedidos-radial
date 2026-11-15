-- Disposable local DB only. M14 canonical timeline cutover and contextual attachments.
\set ON_ERROR_STOP on
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT no_plan();

SELECT is((SELECT timeline_mode FROM private.pedidos_v1_rollout WHERE singleton),'v1','M14 activates canonical timeline');
SELECT has_column('public','anexos','frente_id','Attachments can reference a Front');
SELECT has_column('public','anexos','tarefa_id','Attachments can reference a task');
SELECT has_column('public','anexos','atividade_id','Attachments can reference an update');
SELECT has_function('public','add_pedido_update',ARRAY['uuid','jsonb'],'Canonical update writer exists');
SELECT has_function('public','delete_pedido_update',ARRAY['uuid','uuid'],'Canonical update deletion exists');
SELECT has_function('public','list_pedido_timeline',ARRAY['uuid','uuid','uuid'],'Canonical timeline reader exists');
SELECT ok(NOT has_table_privilege('authenticated','public.comentarios_tarefa','INSERT'),'Legacy comment INSERT is revoked');
SELECT ok(NOT has_table_privilege('authenticated','public.comentarios_tarefa','DELETE'),'Legacy comment DELETE is revoked');
SELECT ok(NOT has_table_privilege('authenticated','public.atividades','INSERT'),'Direct activity INSERT is revoked');
SELECT ok(NOT has_table_privilege('authenticated','public.atividades','DELETE'),'Direct activity DELETE is revoked');

INSERT INTO auth.users(id) VALUES
  ('14000000-0000-4000-8000-000000000001'),
  ('14000000-0000-4000-8000-000000000002');
INSERT INTO public.organizations(id,name,slug) VALUES
  ('14000001-0000-4000-8000-000000000001','Timeline Cutover A','timeline-cutover-a'),
  ('14000001-0000-4000-8000-000000000002','Timeline Cutover B','timeline-cutover-b');
INSERT INTO public.organization_members(organization_id,user_id,role,display_name) VALUES
  ('14000001-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','admin','Admin A'),
  ('14000001-0000-4000-8000-000000000002','14000000-0000-4000-8000-000000000002','admin','Admin B');
INSERT INTO public.pedidos(id,organization_id,numero_pedido,projeto,cliente,endereco,prioridade,status,created_by) VALUES
  ('14000002-0000-4000-8000-000000000001','14000001-0000-4000-8000-000000000001','QA-14-A1','A1','Cliente','Rua','Normal','Em andamento','14000000-0000-4000-8000-000000000001'),
  ('14000002-0000-4000-8000-000000000002','14000001-0000-4000-8000-000000000001','QA-14-A2','A2','Cliente','Rua','Normal','Em andamento','14000000-0000-4000-8000-000000000001'),
  ('14000002-0000-4000-8000-000000000003','14000001-0000-4000-8000-000000000002','QA-14-B1','B1','Cliente','Rua','Normal','Em andamento','14000000-0000-4000-8000-000000000002');
INSERT INTO public.pedido_frentes(id,organization_id,pedido_id,nome,ordem,is_legacy_default) VALUES
  ('14000003-0000-4000-8000-000000000001','14000001-0000-4000-8000-000000000001','14000002-0000-4000-8000-000000000001','Geral',0,false),
  ('14000003-0000-4000-8000-000000000004','14000001-0000-4000-8000-000000000001','14000002-0000-4000-8000-000000000001','Destino',1,false),
  ('14000003-0000-4000-8000-000000000002','14000001-0000-4000-8000-000000000001','14000002-0000-4000-8000-000000000002','Outra',0,false),
  ('14000003-0000-4000-8000-000000000003','14000001-0000-4000-8000-000000000002','14000002-0000-4000-8000-000000000003','Geral',0,false);
INSERT INTO public.tarefas(id,organization_id,pedido_id,frente_id,descricao,status,prioridade,responsavel_user_id,concluido,created_by) VALUES
  ('14000004-0000-4000-8000-000000000001','14000001-0000-4000-8000-000000000001','14000002-0000-4000-8000-000000000001','14000003-0000-4000-8000-000000000001','Pedido A','Aberta','Normal','14000000-0000-4000-8000-000000000001',false,'14000000-0000-4000-8000-000000000001'),
  ('14000004-0000-4000-8000-000000000002','14000001-0000-4000-8000-000000000001',NULL,NULL,'Avulsa A','Aberta','Normal','14000000-0000-4000-8000-000000000001',false,'14000000-0000-4000-8000-000000000001'),
  ('14000004-0000-4000-8000-000000000003','14000001-0000-4000-8000-000000000002','14000002-0000-4000-8000-000000000003','14000003-0000-4000-8000-000000000003','Pedido B','Aberta','Normal','14000000-0000-4000-8000-000000000002',false,'14000000-0000-4000-8000-000000000002');

CREATE TEMP TABLE m14_results(kind text,id uuid);
GRANT SELECT,INSERT ON m14_results TO authenticated;
SELECT set_config('request.jwt.claim.sub','14000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
INSERT INTO m14_results VALUES('task',public.add_pedido_update(
  '14000001-0000-4000-8000-000000000001',
  '{"orderId":null,"frontId":null,"taskId":"14000004-0000-4000-8000-000000000001","text":"Retorno do cliente","followUpDate":"2026-10-10"}'::jsonb));
INSERT INTO m14_results VALUES('order',public.add_pedido_update(
  '14000001-0000-4000-8000-000000000001',
  '{"orderId":"14000002-0000-4000-8000-000000000001","frontId":null,"taskId":null,"text":"Resumo do Pedido"}'::jsonb));
SELECT throws_ok($sql$SELECT public.add_pedido_update(
  '14000001-0000-4000-8000-000000000001',
  '{"orderId":"14000002-0000-4000-8000-000000000001","frontId":null,"taskId":null,"text":"Inválido","followUpDate":"2026-10-11"}'::jsonb)$sql$,
  '22023',NULL,'Follow-up without task is rejected');
SELECT throws_ok($sql$SELECT public.add_pedido_update(
  '14000001-0000-4000-8000-000000000001',
  '{"orderId":"14000002-0000-4000-8000-000000000001","frontId":null,"taskId":null,"text":"Forjado","kind":"system"}'::jsonb)$sql$,
  '22023',NULL,'Client cannot forge system kind');
SELECT throws_ok($sql$SELECT public.add_pedido_update(
  '14000001-0000-4000-8000-000000000002',
  '{"orderId":"14000002-0000-4000-8000-000000000003","frontId":null,"taskId":"14000004-0000-4000-8000-000000000003","text":"Cross tenant"}'::jsonb)$sql$,
  '42501',NULL,'Member cannot write another tenant');
RESET ROLE;

SELECT is((SELECT follow_up_date FROM public.tarefas WHERE id='14000004-0000-4000-8000-000000000001'),
  '2026-10-10'::date,'Update and task follow-up commit together');
SELECT is((SELECT count(*)::int FROM public.comentarios_tarefa WHERE organization_id='14000001-0000-4000-8000-000000000001'),0,
  'Cutover writes no new legacy comments');
SELECT is((SELECT count(*)::int FROM public.list_pedido_timeline(
  '14000001-0000-4000-8000-000000000001','14000002-0000-4000-8000-000000000001',NULL)),2,
  'Order timeline includes order and task updates without duplicates');

INSERT INTO public.anexos(id,organization_id,pedido_id,frente_id,tarefa_id,atividade_id,nome_arquivo,tipo,storage_path)
SELECT '14000006-0000-4000-8000-000000000001','14000001-0000-4000-8000-000000000001',
  '14000002-0000-4000-8000-000000000001','14000003-0000-4000-8000-000000000001',
  '14000004-0000-4000-8000-000000000001',id,'qa.pdf','application/pdf',
  '14000001-0000-4000-8000-000000000001/14000002-0000-4000-8000-000000000001/qa.pdf'
FROM m14_results WHERE kind='task';
SELECT throws_ok($sql$INSERT INTO public.anexos(organization_id,pedido_id,frente_id,tarefa_id,nome_arquivo,tipo,storage_path)
  VALUES('14000001-0000-4000-8000-000000000001','14000002-0000-4000-8000-000000000002',
  '14000003-0000-4000-8000-000000000002','14000004-0000-4000-8000-000000000001','cross.pdf','application/pdf',
  '14000001-0000-4000-8000-000000000001/14000002-0000-4000-8000-000000000002/cross.pdf')$sql$,
  '23514',NULL,'Attachment task cannot cross Pedido');

SELECT set_config('request.jwt.claim.sub','14000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($sql$SELECT public.remove_pedido_front(
  '14000001-0000-4000-8000-000000000001','14000003-0000-4000-8000-000000000001',
  '14000003-0000-4000-8000-000000000004')$sql$,
  'Removing Front moves tasks, history and files atomically');
RESET ROLE;
SELECT is((SELECT frente_id FROM public.tarefas WHERE id='14000004-0000-4000-8000-000000000001'),
  '14000003-0000-4000-8000-000000000004'::uuid,'Task moved to destination Front');
SELECT is((SELECT frente_id FROM public.atividades WHERE id=(SELECT id FROM m14_results WHERE kind='task')),
  '14000003-0000-4000-8000-000000000004'::uuid,'Update context moved to destination Front');
SELECT is((SELECT frente_id FROM public.anexos WHERE id='14000006-0000-4000-8000-000000000001'),
  '14000003-0000-4000-8000-000000000004'::uuid,'File context moved to destination Front');

SELECT set_config('request.jwt.claim.sub','14000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(format('SELECT public.delete_pedido_update(%L,%L)',
  '14000001-0000-4000-8000-000000000001',(SELECT id FROM m14_results WHERE kind='task')),
  'Manual update can be deleted through command');
RESET ROLE;
SELECT is((SELECT atividade_id FROM public.anexos WHERE id='14000006-0000-4000-8000-000000000001'),NULL::uuid,
  'Deleting update preserves file and clears only update link');

SELECT set_config('request.jwt.claim.sub','14000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
INSERT INTO m14_results VALUES('remove-source',public.add_pedido_update(
  '14000001-0000-4000-8000-000000000001',
  '{"orderId":null,"frontId":null,"taskId":"14000004-0000-4000-8000-000000000001","text":"Histórico preservado"}'::jsonb));
RESET ROLE;
UPDATE public.anexos SET atividade_id=(SELECT id FROM m14_results WHERE kind='remove-source')
WHERE id='14000006-0000-4000-8000-000000000001';

SELECT set_config('request.jwt.claim.sub','14000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($sql$SELECT public.update_pedido_task(
  '14000001-0000-4000-8000-000000000001','14000004-0000-4000-8000-000000000002',
  '{"title":"Avulsa revisada"}'::jsonb)$sql$,'Trivial standalone edit succeeds');
SELECT is((SELECT count(*)::int FROM public.atividades
  WHERE tarefa_id='14000004-0000-4000-8000-000000000002'),0,
  'Trivial task edit does not pollute canonical timeline');
SELECT lives_ok($sql$SELECT public.update_pedido_task(
  '14000001-0000-4000-8000-000000000001','14000004-0000-4000-8000-000000000002',
  '{"status":"Concluída"}'::jsonb)$sql$,'Meaningful standalone transition writes canonical event');
SELECT throws_ok($sql$SELECT public.remove_pedido_task(
  '14000001-0000-4000-8000-000000000001','14000004-0000-4000-8000-000000000002')$sql$,
  '23514',NULL,'Standalone task with history cannot lose its last anchor');
SELECT lives_ok($sql$SELECT public.remove_pedido_task(
  '14000001-0000-4000-8000-000000000001','14000004-0000-4000-8000-000000000001')$sql$,
  'Pedido task can be removed while preserving history and files');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.comentarios_tarefa WHERE tarefa_id='14000004-0000-4000-8000-000000000002'),0,
  'Standalone commands never return to legacy comments');
SELECT is((SELECT count(*)::int FROM public.atividades WHERE pedido_id='14000002-0000-4000-8000-000000000001' AND tarefa_id IS NULL),3,
  'Removing Pedido task preserves manual, order and removal history under Pedido');
SELECT is((SELECT tarefa_id FROM public.anexos WHERE id='14000006-0000-4000-8000-000000000001'),NULL::uuid,
  'Removing Pedido task preserves file under Pedido');
SELECT ok((SELECT atividade_id IS NOT NULL FROM public.anexos WHERE id='14000006-0000-4000-8000-000000000001'),
  'Removing Pedido task preserves the file/update relationship');

SELECT * FROM finish();
ROLLBACK;
