-- Disposable local DB only. M11 completion-relative rules.
\set ON_ERROR_STOP on
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT no_plan();

INSERT INTO auth.users(id) VALUES ('11000000-0000-4000-8000-000000000001');
INSERT INTO public.organizations(id,name,slug) VALUES
  ('11000001-0000-4000-8000-000000000001','Relative dates QA','relative-dates-qa');
INSERT INTO public.organization_members(organization_id,user_id,role,display_name) VALUES
  ('11000001-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','admin','Relative Admin');

SELECT has_function('private','materialize_pedido_completion_rules',
  ARRAY['uuid','uuid','timestamp with time zone'],'Private materializer exists');
SELECT ok(NOT has_function_privilege('authenticated',
  'private.materialize_pedido_completion_rules(uuid,uuid,timestamptz)','EXECUTE'),
  'Authenticated cannot call the private materializer');

SELECT set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE qa_template AS SELECT public.save_pedido_template(
  '11000001-0000-4000-8000-000000000001',
  '{"id":null,"name":"Fluxo relativo","expectedVersion":null,"definition":{
    "schemaVersion":1,"fronts":[{"key":"f","name":"Geral","position":0}],
    "tasks":[
      {"key":"source","frontKey":"f","title":"Aprovação","description":null,"priority":"Normal","dueRule":null,"followUpRule":null},
      {"key":"target","frontKey":"f","title":"Entrega","description":null,"priority":"Normal",
       "dueRule":{"kind":"completion","sourceTaskKey":"source","offsetDays":1},
       "followUpRule":{"kind":"completion","sourceTaskKey":"source","offsetDays":2}}],
    "subtasks":[{"key":"sub","taskKey":"target","title":"Avisar cliente","priority":null,
      "dueRule":{"kind":"completion","sourceTaskKey":"source","offsetDays":3}}],"dependencies":[]}}'::jsonb
) payload;
SELECT lives_ok($sql$SELECT public.duplicate_pedido_template(
  '11000001-0000-4000-8000-000000000001',(SELECT (payload->>'id')::uuid FROM qa_template),'Fluxo cópia'
)$sql$,'Completion-relative template can be duplicated');

CREATE TEMP TABLE qa_instance AS SELECT public.instantiate_pedido_template(
  '11000001-0000-4000-8000-000000000001',jsonb_build_object(
    'templateId',(SELECT (payload->>'id')::uuid FROM qa_template),'expectedVersion',1,
    'requestId','11000009-0000-4000-8000-000000000001','timeZone','America/Sao_Paulo',
    'order',jsonb_build_object('number','QA-M11-1','title','Relativo','client','Cliente','address','Rua',
      'legacyPriority','Normal','utilityDueDate',NULL)
  )) order_id;
CREATE TEMP TABLE qa_tasks AS SELECT
  (array_agg(id) FILTER (WHERE descricao='Aprovação'))[1] source_id,
  (array_agg(id) FILTER (WHERE descricao='Entrega'))[1] target_id
  FROM public.tarefas WHERE pedido_id=(SELECT order_id FROM qa_instance);
SELECT is(public.instantiate_pedido_template(
  '11000001-0000-4000-8000-000000000001',jsonb_build_object(
    'templateId',(SELECT (payload->>'id')::uuid FROM qa_template),'expectedVersion',1,
    'requestId','11000009-0000-4000-8000-000000000001','timeZone','America/Sao_Paulo',
    'order',jsonb_build_object('number','QA-M11-1','title','Relativo','client','Cliente','address','Rua',
      'legacyPriority','Normal','utilityDueDate',NULL)
  )),(SELECT order_id FROM qa_instance),'Idempotent retry returns the already processed Pedido');
SELECT is((SELECT vencimento_rule->>'state' FROM public.tarefas WHERE id=(SELECT target_id FROM qa_tasks)),
  'pending','Task due rule starts pending');
SELECT is((SELECT follow_up_rule->>'state' FROM public.tarefas WHERE id=(SELECT target_id FROM qa_tasks)),
  'pending','Task follow-up rule starts pending');
SELECT is((SELECT vencimento_rule->>'state' FROM public.subtarefas
  WHERE tarefa_id=(SELECT target_id FROM qa_tasks)),'pending','Subtask rule starts pending');
SELECT is((SELECT vencimento FROM public.tarefas WHERE id=(SELECT target_id FROM qa_tasks)),NULL::date,
  'Pending task has no invented due date');

RESET ROLE;
UPDATE public.tarefas SET status='Concluída',concluido=true,concluida_em='2026-10-01 01:00:00+00'
  WHERE id=(SELECT source_id FROM qa_tasks);
SELECT is((SELECT vencimento FROM public.tarefas WHERE id=(SELECT target_id FROM qa_tasks)),
  '2026-10-01'::date,'-03 timezone uses the local completion day plus one');
SELECT is((SELECT follow_up_date FROM public.tarefas WHERE id=(SELECT target_id FROM qa_tasks)),
  '2026-10-02'::date,'Follow-up materializes once');
SELECT is((SELECT vencimento FROM public.subtarefas WHERE tarefa_id=(SELECT target_id FROM qa_tasks)),
  '2026-10-03'::date,'Subtask materializes once');
SELECT is((SELECT vencimento_rule->>'state' FROM public.tarefas WHERE id=(SELECT target_id FROM qa_tasks)),
  'materialized','Materialized provenance is persisted');

UPDATE public.tarefas SET status='Aberta',concluido=false,concluida_em=NULL WHERE id=(SELECT source_id FROM qa_tasks);
UPDATE public.tarefas SET status='Concluída',concluido=true,concluida_em='2026-11-01 01:00:00+00'
  WHERE id=(SELECT source_id FROM qa_tasks);
SELECT is((SELECT vencimento FROM public.tarefas WHERE id=(SELECT target_id FROM qa_tasks)),
  '2026-10-01'::date,'Reopening and completing again does not recalculate');

SET LOCAL ROLE authenticated;
SELECT lives_ok($sql$SELECT public.update_pedido_task(
  '11000001-0000-4000-8000-000000000001',(SELECT target_id FROM qa_tasks),
  '{"dueDate":null}'::jsonb)$sql$,'Manual clear is accepted after materialization');
SELECT is((SELECT vencimento_rule->>'state' FROM public.tarefas WHERE id=(SELECT target_id FROM qa_tasks)),
  'materialized','Editing after materialization keeps materialized provenance');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
