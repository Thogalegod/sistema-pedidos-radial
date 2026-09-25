-- Disposable local DB only. M07 integrity and compatibility assertions.
\set ON_ERROR_STOP on
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT no_plan();

INSERT INTO auth.users(id) VALUES ('06000000-0000-4000-8000-000000000001');
INSERT INTO public.organizations(id,name,slug) VALUES
  ('06000001-0000-4000-8000-000000000001','Pedidos validate QA','pedidos-v1-validate-qa');
INSERT INTO public.organization_members(organization_id,user_id,role) VALUES
  ('06000001-0000-4000-8000-000000000001','06000000-0000-4000-8000-000000000001','admin');
INSERT INTO public.pedidos(id,organization_id,numero_pedido,projeto,cliente,endereco,prioridade,status)
VALUES ('06000002-0000-4000-8000-000000000001','06000001-0000-4000-8000-000000000001',
  'QA-M07','Pedido QA','Cliente QA','Rua QA','Normal','Em andamento');
INSERT INTO public.pedido_frentes(id,organization_id,pedido_id,nome)
VALUES ('06000003-0000-4000-8000-000000000001','06000001-0000-4000-8000-000000000001',
  '06000002-0000-4000-8000-000000000001','Geral');
INSERT INTO public.tarefas(id,organization_id,pedido_id,frente_id,descricao,concluido,status,prioridade,responsavel_user_id)
VALUES ('06000004-0000-4000-8000-000000000001','06000001-0000-4000-8000-000000000001',
  '06000002-0000-4000-8000-000000000001','06000003-0000-4000-8000-000000000001',
  'Tarefa QA',false,'Aberta','Normal','06000000-0000-4000-8000-000000000001');
INSERT INTO public.anexos(id,organization_id,pedido_id,nome_arquivo,tipo,storage_path)
VALUES ('06000005-0000-4000-8000-000000000001','06000001-0000-4000-8000-000000000001',
  '06000002-0000-4000-8000-000000000001','qa-m07.pdf','application/pdf','qa-m07.pdf');

SELECT is((SELECT status_mode FROM private.pedidos_v1_rollout WHERE singleton),'v1',
  'M07 retains canonical task status mode');
SELECT ok((SELECT convalidated FROM pg_constraint
  WHERE conrelid='public.tarefas'::regclass AND conname='tarefas_responsavel_member_fkey'),
  'Historical assignee membership FK is validated');
SELECT is((SELECT count(*)::int FROM pg_constraint
  WHERE conrelid IN ('public.tarefas'::regclass,'public.pedido_frentes'::regclass)
    AND contype='f' AND NOT convalidated),0,'All task/front FKs are validated');
SELECT ok((SELECT attnotnull FROM pg_attribute
  WHERE attrelid='public.tarefas'::regclass AND attname='status'),
  'Canonical task status is NOT NULL');
SELECT ok((SELECT attnotnull FROM pg_attribute
  WHERE attrelid='public.tarefas'::regclass AND attname='prioridade'),
  'Task priority is NOT NULL');
SELECT has_column('public','tarefas','responsavel','Legacy assignee text remains readable');
SELECT has_column('public','tarefas','concluido','Legacy completion projection remains');
SELECT has_column('public','tarefas','prazo','Legacy due timestamp remains');
SELECT has_table('public','comentarios_tarefa','Historical task notes remain');
SELECT has_table('public','atividades','Pedido activity history remains');
SELECT has_table('public','anexos','Pedido attachments remain');
SELECT ok(NOT has_schema_privilege('authenticated','private','USAGE'),
  'Authenticated cannot enter private schema');
SELECT ok(NOT has_schema_privilege('anon','private','USAGE'),
  'Anonymous clients cannot enter private schema');
SELECT ok(NOT has_table_privilege('authenticated','private.pedidos_v1_rollout','SELECT'),
  'Authenticated cannot read private rollout table');
SELECT ok(NOT has_function_privilege('authenticated',
  'private.ensure_pedido_default_front(uuid,uuid)'::regprocedure,'EXECUTE'),
  'Authenticated cannot execute private front helper directly');
SELECT ok(NOT has_function_privilege('authenticated',
  'private.sync_pedido_task_canonical_state()'::regprocedure,'EXECUTE'),
  'Authenticated cannot execute private status trigger function directly');

SELECT set_config('request.jwt.claim.sub','06000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM public.anexos
  WHERE id='06000005-0000-4000-8000-000000000001'),1,
  'Organization member can still read private attachment metadata');
SELECT lives_ok($sql$DELETE FROM public.anexos
  WHERE id='06000005-0000-4000-8000-000000000001'$sql$,
  'Organization member can still remove attachment metadata');
SELECT is((SELECT count(*)::int FROM public.anexos
  WHERE id='06000005-0000-4000-8000-000000000001'),0,
  'Removed attachment metadata is no longer visible');
RESET ROLE;

SELECT throws_ok($sql$UPDATE public.pedidos SET status='Ação Pendente'
  WHERE id='06000002-0000-4000-8000-000000000001'$sql$,
  '23514',NULL,'Legacy Pedido status is rejected');
UPDATE public.pedidos SET status='Em andamento'
WHERE id='06000002-0000-4000-8000-000000000001';

SELECT throws_ok($sql$UPDATE public.tarefas SET prioridade=NULL
  WHERE id='06000004-0000-4000-8000-000000000001'$sql$,
  '23502',NULL,'Task priority cannot become NULL');
UPDATE public.tarefas SET prioridade='Normal'
WHERE id='06000004-0000-4000-8000-000000000001';

SELECT throws_ok($sql$UPDATE public.tarefas SET frente_id=NULL
  WHERE id='06000004-0000-4000-8000-000000000001'$sql$,
  '23514',NULL,'Pedido task cannot lose its Frente');
UPDATE public.tarefas SET frente_id='06000003-0000-4000-8000-000000000001'
WHERE id='06000004-0000-4000-8000-000000000001';

SELECT is((SELECT count(*)::int FROM public.tarefas WHERE id='06000004-0000-4000-8000-000000000001'
  AND status='Aberta' AND prioridade='Normal' AND frente_id='06000003-0000-4000-8000-000000000001'),
  1,'Valid Pedido task remains intact');
SELECT * FROM finish();
ROLLBACK;
