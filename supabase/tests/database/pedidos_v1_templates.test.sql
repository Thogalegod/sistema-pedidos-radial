-- Disposable local DB only. M09 template blueprint, rules, RLS and grant assertions.
\set ON_ERROR_STOP on
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT no_plan();

INSERT INTO auth.users(id) VALUES
  ('09000000-0000-4000-8000-000000000001'),
  ('09000000-0000-4000-8000-000000000002');
INSERT INTO public.organizations(id,name,slug) VALUES
  ('09000001-0000-4000-8000-000000000001','Templates QA','pedidos-v1-templates-qa'),
  ('09000001-0000-4000-8000-000000000002','Templates Other','pedidos-v1-templates-other');
INSERT INTO public.organization_members(organization_id,user_id,role,display_name) VALUES
  ('09000001-0000-4000-8000-000000000001','09000000-0000-4000-8000-000000000001','admin','Template Admin'),
  ('09000001-0000-4000-8000-000000000002','09000000-0000-4000-8000-000000000002','admin','Other Admin');

SELECT has_table('public','pedido_templates','Template blueprint table exists');
SELECT has_function('private','validate_pedido_template',ARRAY['jsonb'],'Private blueprint validator exists');
SELECT has_column('public','tarefas','vencimento_rule','Tasks expose due-date rule provenance');
SELECT has_column('public','tarefas','follow_up_rule','Tasks expose follow-up rule provenance');
SELECT has_column('public','subtarefas','vencimento_rule','Subtasks expose due-date rule provenance');
SELECT has_column('public','pedidos','template_id','Orders expose template provenance');
SELECT has_column('public','pedidos','template_version','Orders expose template version');
SELECT has_column('public','pedidos','template_request_id','Orders expose idempotency request id');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.pedido_templates'::regclass),
  'RLS is enabled on templates');
SELECT ok(has_table_privilege('authenticated','public.pedido_templates','SELECT'),
  'Authenticated can read templates');
SELECT ok(NOT has_table_privilege('authenticated','public.pedido_templates','INSERT'),
  'Authenticated cannot insert templates directly');
SELECT ok(NOT has_table_privilege('authenticated','public.pedido_templates','UPDATE'),
  'Authenticated cannot update templates directly');
SELECT ok(NOT has_table_privilege('authenticated','public.pedido_templates','DELETE'),
  'Authenticated cannot delete templates directly');
SELECT ok(NOT has_table_privilege('authenticated','public.pedido_templates','TRUNCATE'),
  'Authenticated cannot truncate templates');
SELECT ok(NOT has_table_privilege('anon','public.pedido_templates','SELECT'),
  'Anon receives no template access');

INSERT INTO public.pedido_templates(id,organization_id,nome,version,definition,created_by)
VALUES (
  '09000002-0000-4000-8000-000000000001','09000001-0000-4000-8000-000000000001',
  'Modelo válido',1,
  '{"schemaVersion":1,"fronts":[{"key":"geral","name":"Geral","position":0}],
    "tasks":[
      {"key":"origem","frontKey":"geral","title":"Origem","description":null,"priority":"Normal",
       "dueRule":{"kind":"creation","offsetDays":0},"followUpRule":null},
      {"key":"destino","frontKey":"geral","title":"Destino","description":null,"priority":"Alta",
       "dueRule":{"kind":"completion","sourceTaskKey":"origem","offsetDays":2},"followUpRule":null}],
    "subtasks":[{"key":"conferir","taskKey":"destino","title":"Conferir","priority":null,
      "dueRule":{"kind":"creation","offsetDays":1}}],
    "dependencies":[{"taskKey":"destino","predecessorKey":"origem"}]}'::jsonb,
  '09000000-0000-4000-8000-000000000001'
),(
  '09000002-0000-4000-8000-000000000002','09000001-0000-4000-8000-000000000002',
  'Outro tenant',1,
  '{"schemaVersion":1,"fronts":[],"tasks":[],"subtasks":[],"dependencies":[]}'::jsonb,
  '09000000-0000-4000-8000-000000000002'
);
SELECT pass('Valid blueprints are accepted');

SELECT throws_ok($sql$INSERT INTO public.pedido_templates(organization_id,nome,version,definition,created_by)
VALUES ('09000001-0000-4000-8000-000000000001','Frente ausente',1,
'{"schemaVersion":1,"fronts":[],"tasks":[{"key":"a","frontKey":"missing","title":"A",
"description":null,"priority":"Normal","dueRule":null,"followUpRule":null}],
"subtasks":[],"dependencies":[]}'::jsonb,'09000000-0000-4000-8000-000000000001')$sql$,
'22023',NULL,'Missing Front reference is rejected');

SELECT throws_ok($sql$INSERT INTO public.pedido_templates(organization_id,nome,version,definition,created_by)
VALUES ('09000001-0000-4000-8000-000000000001','Chave repetida',1,
'{"schemaVersion":1,"fronts":[{"key":"f","name":"F","position":0}],"tasks":[
{"key":"a","frontKey":"f","title":"A","description":null,"priority":"Normal","dueRule":null,"followUpRule":null},
{"key":"a","frontKey":"f","title":"B","description":null,"priority":"Normal","dueRule":null,"followUpRule":null}],
"subtasks":[],"dependencies":[]}'::jsonb,'09000000-0000-4000-8000-000000000001')$sql$,
'22023',NULL,'Duplicate task keys are rejected');

SELECT throws_ok($sql$INSERT INTO public.pedido_templates(organization_id,nome,version,definition,created_by)
VALUES ('09000001-0000-4000-8000-000000000001','Ciclo',1,
'{"schemaVersion":1,"fronts":[{"key":"f","name":"F","position":0}],"tasks":[
{"key":"a","frontKey":"f","title":"A","description":null,"priority":"Normal","dueRule":null,"followUpRule":null},
{"key":"b","frontKey":"f","title":"B","description":null,"priority":"Normal","dueRule":null,"followUpRule":null}],
"subtasks":[],"dependencies":[{"taskKey":"a","predecessorKey":"b"},{"taskKey":"b","predecessorKey":"a"}]}'::jsonb,
'09000000-0000-4000-8000-000000000001')$sql$,
'22023',NULL,'Dependency cycles are rejected');

SELECT throws_ok($sql$INSERT INTO public.pedido_templates(organization_id,nome,version,definition,created_by)
VALUES ('09000001-0000-4000-8000-000000000001','Ciclo regra',1,
'{"schemaVersion":1,"fronts":[{"key":"f","name":"F","position":0}],"tasks":[
{"key":"a","frontKey":"f","title":"A","description":null,"priority":"Normal",
 "dueRule":{"kind":"completion","sourceTaskKey":"b","offsetDays":1},"followUpRule":null},
{"key":"b","frontKey":"f","title":"B","description":null,"priority":"Normal",
 "dueRule":{"kind":"completion","sourceTaskKey":"a","offsetDays":1},"followUpRule":null}],
"subtasks":[],"dependencies":[]}'::jsonb,'09000000-0000-4000-8000-000000000001')$sql$,
'22023',NULL,'Completion-rule cycles are rejected');

SELECT throws_ok($sql$INSERT INTO public.pedido_templates(organization_id,nome,version,definition,created_by)
VALUES ('09000001-0000-4000-8000-000000000001','Ciclo regra com espaços',1,
'{"schemaVersion":1,"fronts":[{"key":"f","name":"F","position":0}],"tasks":[
{"key":" a ","frontKey":"f","title":"A","description":null,"priority":"Normal",
 "dueRule":{"kind":"completion","sourceTaskKey":"b","offsetDays":1},"followUpRule":null},
{"key":" b ","frontKey":"f","title":"B","description":null,"priority":"Normal",
 "dueRule":{"kind":"completion","sourceTaskKey":"a","offsetDays":1},"followUpRule":null}],
"subtasks":[],"dependencies":[]}'::jsonb,'09000000-0000-4000-8000-000000000001')$sql$,
'22023',NULL,'Completion-rule cycles cannot bypass normalization');

SELECT throws_ok($sql$INSERT INTO public.pedido_templates(organization_id,nome,version,definition,created_by)
VALUES ('09000001-0000-4000-8000-000000000001','Offset inválido',1,
'{"schemaVersion":1,"fronts":[{"key":"f","name":"F","position":0}],"tasks":[
{"key":"a","frontKey":"f","title":"A","description":null,"priority":"Normal",
 "dueRule":{"kind":"creation","offsetDays":-1},"followUpRule":null}],
"subtasks":[],"dependencies":[]}'::jsonb,'09000000-0000-4000-8000-000000000001')$sql$,
'22023',NULL,'Negative date offsets are rejected');

INSERT INTO public.pedidos(id,organization_id,numero_pedido,projeto,cliente,endereco,prioridade,status,
  template_id,template_version,template_request_id)
VALUES
  ('09000003-0000-4000-8000-000000000001','09000001-0000-4000-8000-000000000001','QA-M09-A',
   'Pedido A','Cliente','Rua','Normal','Em andamento','09000002-0000-4000-8000-000000000001',1,
   '09000009-0000-4000-8000-000000000001'),
  ('09000003-0000-4000-8000-000000000002','09000001-0000-4000-8000-000000000001','QA-M09-B',
   'Pedido B','Cliente','Rua','Normal','Em andamento',NULL,NULL,NULL),
  ('09000003-0000-4000-8000-000000000003','09000001-0000-4000-8000-000000000001','QA-M09-CASCADE',
   'Pedido Cascade','Cliente','Rua','Normal','Em andamento',NULL,NULL,NULL),
  ('09000003-0000-4000-8000-000000000004','09000001-0000-4000-8000-000000000002','QA-M09-OTHER',
   'Pedido Other','Cliente','Rua','Normal','Em andamento',NULL,NULL,NULL);
SELECT throws_ok($sql$INSERT INTO public.pedidos(organization_id,numero_pedido,projeto,cliente,endereco,prioridade,status,
template_id,template_version) VALUES('09000001-0000-4000-8000-000000000001','QA-CROSS','Cross','C','R','Normal',
'Em andamento','09000002-0000-4000-8000-000000000002',1)$sql$,
'23503',NULL,'Order cannot reference a template from another organization');

INSERT INTO public.pedido_frentes(id,organization_id,pedido_id,nome) VALUES
  ('09000004-0000-4000-8000-000000000001','09000001-0000-4000-8000-000000000001','09000003-0000-4000-8000-000000000001','Geral'),
  ('09000004-0000-4000-8000-000000000002','09000001-0000-4000-8000-000000000001','09000003-0000-4000-8000-000000000002','Geral'),
  ('09000004-0000-4000-8000-000000000003','09000001-0000-4000-8000-000000000001','09000003-0000-4000-8000-000000000003','Geral'),
  ('09000004-0000-4000-8000-000000000004','09000001-0000-4000-8000-000000000002','09000003-0000-4000-8000-000000000004','Geral');
INSERT INTO public.tarefas(id,organization_id,pedido_id,frente_id,descricao,concluido,status,prioridade) VALUES
  ('09000005-0000-4000-8000-000000000001','09000001-0000-4000-8000-000000000001','09000003-0000-4000-8000-000000000001','09000004-0000-4000-8000-000000000001','Origem',false,'Aberta','Normal'),
  ('09000005-0000-4000-8000-000000000002','09000001-0000-4000-8000-000000000001','09000003-0000-4000-8000-000000000001','09000004-0000-4000-8000-000000000001','Destino',false,'Aberta','Normal'),
  ('09000005-0000-4000-8000-000000000003','09000001-0000-4000-8000-000000000001','09000003-0000-4000-8000-000000000002','09000004-0000-4000-8000-000000000002','Outra ordem',false,'Aberta','Normal'),
  ('09000005-0000-4000-8000-000000000004','09000001-0000-4000-8000-000000000002','09000003-0000-4000-8000-000000000004','09000004-0000-4000-8000-000000000004','Outro tenant',false,'Aberta','Normal'),
  ('09000005-0000-4000-8000-000000000005','09000001-0000-4000-8000-000000000001',NULL,NULL,'Avulsa',false,'Aberta','Normal'),
  ('09000005-0000-4000-8000-000000000006','09000001-0000-4000-8000-000000000001','09000003-0000-4000-8000-000000000003','09000004-0000-4000-8000-000000000003','Origem cascade',false,'Aberta','Normal'),
  ('09000005-0000-4000-8000-000000000007','09000001-0000-4000-8000-000000000001','09000003-0000-4000-8000-000000000003','09000004-0000-4000-8000-000000000003','Destino cascade',false,'Aberta','Normal');

SELECT lives_ok($sql$UPDATE public.tarefas SET vencimento_rule=
'{"sourceTaskId":"09000005-0000-4000-8000-000000000001","offsetDays":2,
  "timeZone":"America/Sao_Paulo","state":"pending","materializedAt":null}'::jsonb
WHERE id='09000005-0000-4000-8000-000000000002'$sql$,
'Pending rule accepts a source task in the same order');
SELECT throws_ok($sql$UPDATE public.tarefas SET vencimento_rule=
'{"sourceTaskId":"09000005-0000-4000-8000-000000000003","offsetDays":2,
  "timeZone":"America/Sao_Paulo","state":"pending","materializedAt":null}'::jsonb
WHERE id='09000005-0000-4000-8000-000000000002'$sql$,
'23503',NULL,'Rule source from another order is rejected');
SELECT throws_ok($sql$UPDATE public.tarefas SET vencimento_rule=
'{"sourceTaskId":"09000005-0000-4000-8000-000000000004","offsetDays":2,
  "timeZone":"America/Sao_Paulo","state":"pending","materializedAt":null}'::jsonb
WHERE id='09000005-0000-4000-8000-000000000002'$sql$,
'23503',NULL,'Rule source from another organization is rejected');
SELECT throws_ok($sql$UPDATE public.tarefas SET vencimento_rule=
'{"sourceTaskId":"09000005-0000-4000-8000-000000000005","offsetDays":2,
  "timeZone":"America/Sao_Paulo","state":"pending","materializedAt":null}'::jsonb
WHERE id='09000005-0000-4000-8000-000000000002'$sql$,
'23503',NULL,'Standalone task cannot be a rule source');
SELECT throws_ok($sql$DELETE FROM public.tarefas WHERE id='09000005-0000-4000-8000-000000000001'$sql$,
'23503',NULL,'Pending rule blocks individual deletion of its source task');
SELECT lives_ok($sql$UPDATE public.tarefas SET vencimento_rule=
'{"sourceTaskId":"09000005-0000-4000-8000-000000000001","offsetDays":2,
  "timeZone":"America/Sao_Paulo","state":"materialized","materializedAt":"2026-09-25T12:00:00Z"}'::jsonb
WHERE id='09000005-0000-4000-8000-000000000002'$sql$,
'Materialized rule keeps provenance');
SELECT lives_ok($sql$DELETE FROM public.tarefas WHERE id='09000005-0000-4000-8000-000000000001'$sql$,
'Materialized provenance does not block source deletion');

UPDATE public.tarefas SET follow_up_rule=
'{"sourceTaskId":"09000005-0000-4000-8000-000000000006","offsetDays":1,
  "timeZone":"America/Sao_Paulo","state":"pending","materializedAt":null}'::jsonb
WHERE id='09000005-0000-4000-8000-000000000007';
SELECT lives_ok($sql$DELETE FROM public.pedidos WHERE id='09000003-0000-4000-8000-000000000003'$sql$,
'Deleting the whole order can cascade through pending rules');

SELECT set_config('request.jwt.claim.sub','09000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM public.pedido_templates),1,
  'RLS exposes only templates from the current organization');
SELECT throws_ok($sql$INSERT INTO public.pedido_templates(organization_id,nome,version,definition)
VALUES('09000001-0000-4000-8000-000000000001','API direta',1,
'{"schemaVersion":1,"fronts":[],"tasks":[],"subtasks":[],"dependencies":[]}'::jsonb)$sql$,
'42501',NULL,'Authenticated API cannot write templates directly');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($sql$SELECT count(*) FROM public.pedido_templates$sql$,
'42501',NULL,'Anon cannot read templates');
RESET ROLE;

SELECT is((SELECT count(*)::int FROM public.pedidos
  WHERE template_id IS NOT NULL AND (template_version IS NULL OR template_version<1)),0,
  'No order has incomplete template provenance');
SELECT is((SELECT count(*)::int FROM public.tarefas
  WHERE vencimento_rule IS NOT NULL OR follow_up_rule IS NOT NULL),1,
  'Only the materialized test rule remains after cascade checks');
SELECT * FROM finish();
ROLLBACK;
