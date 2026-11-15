-- Disposable local DB only. M08 standalone task and task-note assertions.
\set ON_ERROR_STOP on
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT no_plan();

INSERT INTO auth.users(id) VALUES
  ('08000000-0000-4000-8000-000000000001'),
  ('08000000-0000-4000-8000-000000000002');
INSERT INTO public.organizations(id,name,slug) VALUES
  ('08000001-0000-4000-8000-000000000001','Quick task QA','pedidos-v1-quick-task-qa'),
  ('08000001-0000-4000-8000-000000000002','Other QA','pedidos-v1-quick-task-other');
INSERT INTO public.organization_members(organization_id,user_id,role,display_name) VALUES
  ('08000001-0000-4000-8000-000000000001','08000000-0000-4000-8000-000000000001','admin','QA Admin'),
  ('08000001-0000-4000-8000-000000000002','08000000-0000-4000-8000-000000000002','admin','Other Admin');
INSERT INTO public.pedidos(id,organization_id,numero_pedido,projeto,cliente,endereco,prioridade,status)
VALUES ('08000002-0000-4000-8000-000000000001','08000001-0000-4000-8000-000000000001',
  'QA-M08','Pedido QA','Cliente QA','Rua QA','Normal','Em andamento');
INSERT INTO public.pedido_frentes(id,organization_id,pedido_id,nome)
VALUES ('08000003-0000-4000-8000-000000000001','08000001-0000-4000-8000-000000000001',
  '08000002-0000-4000-8000-000000000001','Geral');
INSERT INTO public.tarefas(id,organization_id,pedido_id,frente_id,descricao,concluido,status,prioridade,responsavel_user_id)
VALUES ('08000004-0000-4000-8000-000000000001','08000001-0000-4000-8000-000000000001',
  '08000002-0000-4000-8000-000000000001','08000003-0000-4000-8000-000000000001',
  'Tarefa do Pedido',false,'Aberta','Normal','08000000-0000-4000-8000-000000000001');

SELECT ok(NOT (SELECT attnotnull FROM pg_attribute
  WHERE attrelid='public.tarefas'::regclass AND attname='pedido_id'),
  'pedido_id accepts standalone tasks');
SELECT has_column('public','comentarios_tarefa','event_type','Task notes expose event origin metadata');
SELECT ok((SELECT convalidated FROM pg_constraint
  WHERE conrelid='public.tarefas'::regclass AND conname='tarefas_pedido_front_pair_check'),
  'Pedido and Frente pair check is active');

SELECT throws_ok($sql$UPDATE public.tarefas SET frente_id=NULL
  WHERE id='08000004-0000-4000-8000-000000000001'$sql$,
  '23514',NULL,'Existing Pedido task cannot lose its Frente');
SELECT throws_ok($sql$INSERT INTO public.tarefas(
  organization_id,pedido_id,frente_id,descricao,concluido,status,prioridade,responsavel_user_id
) VALUES(
  '08000001-0000-4000-8000-000000000001',NULL,'08000003-0000-4000-8000-000000000001',
  'Par inválido',false,'Aberta','Normal','08000000-0000-4000-8000-000000000001'
)$sql$,'23514',NULL,'Standalone task with Frente is rejected');

SELECT set_config('request.jwt.claim.sub','08000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($sql$SELECT public.create_pedido_task(
  '08000001-0000-4000-8000-000000000001',
  '{"title":"Tarefa avulsa QA","orderId":null,"frontId":null,
    "assigneeId":"08000000-0000-4000-8000-000000000001","priority":"Alta"}'::jsonb
)$sql$,'Authorized member creates a standalone task');
SELECT is((SELECT count(*)::int FROM public.tarefas
  WHERE organization_id='08000001-0000-4000-8000-000000000001'
    AND descricao='Tarefa avulsa QA' AND pedido_id IS NULL AND frente_id IS NULL
    AND responsavel_user_id='08000000-0000-4000-8000-000000000001'),1,
  'Standalone task persists as null/null with explicit assignee');

SELECT throws_ok($sql$SELECT public.create_pedido_task(
  '08000001-0000-4000-8000-000000000001',
  '{"title":"Sem responsável","orderId":null,"frontId":null}'::jsonb
)$sql$,'23514',NULL,'Standalone task requires an assignee');
SELECT throws_ok($sql$SELECT public.create_pedido_task(
  '08000001-0000-4000-8000-000000000001',
  '{"title":"Membro externo","orderId":null,"frontId":null,
    "assigneeId":"08000000-0000-4000-8000-000000000002"}'::jsonb
)$sql$,'23503',NULL,'Assignee from another tenant is rejected');
SELECT throws_ok($sql$SELECT public.create_pedido_task(
  '08000001-0000-4000-8000-000000000001',
  '{"title":"Par parcial","orderId":null,
    "frontId":"08000003-0000-4000-8000-000000000001",
    "assigneeId":"08000000-0000-4000-8000-000000000001"}'::jsonb
)$sql$,'23514',NULL,'Standalone task cannot carry a Frente');

SELECT lives_ok($sql$SELECT public.update_pedido_task(
  '08000001-0000-4000-8000-000000000001',
  (SELECT id FROM public.tarefas WHERE descricao='Tarefa avulsa QA'),
  '{"status":"Concluída"}'::jsonb
)$sql$,'Standalone task can be completed');
SELECT lives_ok($sql$SELECT public.update_pedido_task(
  '08000001-0000-4000-8000-000000000001',
  (SELECT id FROM public.tarefas WHERE descricao='Tarefa avulsa QA'),
  '{"status":"Aguardando","waiting":{"type":"customer","userId":null,"note":"Retorno"}}'::jsonb
)$sql$,'Standalone task can be reopened into waiting state');
SELECT is((SELECT status FROM public.tarefas WHERE descricao='Tarefa avulsa QA'),'Aguardando',
  'Standalone task keeps canonical waiting status');

SELECT throws_ok($sql$SELECT public.add_pedido_dependency(
  '08000001-0000-4000-8000-000000000001',
  (SELECT id FROM public.tarefas WHERE descricao='Tarefa avulsa QA'),
  '08000004-0000-4000-8000-000000000001'
)$sql$,'23503',NULL,'Standalone task cannot enter dependency graph');

SELECT lives_ok($sql$INSERT INTO public.comentarios_tarefa(
  organization_id,tarefa_id,texto,event_type
) VALUES(
  '08000001-0000-4000-8000-000000000001',
  (SELECT id FROM public.tarefas WHERE descricao='Tarefa avulsa QA'),'Nota humana',NULL
)$sql$,'Human task note can be added without Pedido context');
SELECT is((SELECT usuario FROM public.comentarios_tarefa WHERE texto='Nota humana'),'QA Admin',
  'Human task note receives the real member label');
SELECT throws_ok($sql$INSERT INTO public.comentarios_tarefa(
  organization_id,tarefa_id,texto,event_type
) VALUES(
  '08000001-0000-4000-8000-000000000001',
  (SELECT id FROM public.tarefas WHERE descricao='Tarefa avulsa QA'),'Evento forjado','task_updated'
)$sql$,'42501',NULL,'Direct API cannot forge a system event');
SELECT throws_ok($sql$DELETE FROM public.comentarios_tarefa
  WHERE tarefa_id=(SELECT id FROM public.tarefas WHERE descricao='Tarefa avulsa QA')
    AND event_type IS NOT NULL$sql$,'42501',NULL,'Direct API cannot delete standalone system events');
SELECT lives_ok($sql$DELETE FROM public.comentarios_tarefa WHERE texto='Nota humana'$sql$,
  'Human note remains deletable');
RESET ROLE;

SELECT is((SELECT count(*)::int FROM public.tarefas
  WHERE (pedido_id IS NULL) IS DISTINCT FROM (frente_id IS NULL)),0,
  'No task has an inconsistent Pedido/Frente pair');
SELECT is((SELECT count(*)::int FROM public.tarefa_dependencias d
  JOIN public.tarefas t ON t.organization_id=d.organization_id AND t.id=d.tarefa_id
  JOIN public.tarefas p ON p.organization_id=d.organization_id AND p.id=d.predecessora_id
  WHERE t.pedido_id IS NULL OR p.pedido_id IS NULL),0,
  'No dependency edge involves a standalone task');
SELECT * FROM finish();
ROLLBACK;
