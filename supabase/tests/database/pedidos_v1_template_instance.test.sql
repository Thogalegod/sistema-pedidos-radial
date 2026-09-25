-- Disposable local DB only. M10 template commands, atomic instantiation and tenant assertions.
\set ON_ERROR_STOP on
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT no_plan();

INSERT INTO auth.users(id) VALUES
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002');
INSERT INTO public.organizations(id,name,slug) VALUES
  ('10000001-0000-4000-8000-000000000001','Template instance QA','pedidos-v1-template-instance-qa'),
  ('10000001-0000-4000-8000-000000000002','Template other QA','pedidos-v1-template-instance-other');
INSERT INTO public.organization_members(organization_id,user_id,role,display_name) VALUES
  ('10000001-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','admin','Template Instance Admin'),
  ('10000001-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','admin','Other Admin');

SELECT has_column('public','pedidos','template_request_fingerprint','Orders persist idempotency fingerprint');
SELECT has_function('public','save_pedido_template',ARRAY['uuid','jsonb'],'Template save RPC exists');
SELECT has_function('public','duplicate_pedido_template',ARRAY['uuid','uuid','text'],'Template duplicate RPC exists');
SELECT has_function('public','instantiate_pedido_template',ARRAY['uuid','jsonb'],'Template instance RPC exists');
SELECT ok(has_function_privilege('authenticated','public.save_pedido_template(uuid,jsonb)','EXECUTE'),
  'Authenticated can call save RPC');
SELECT ok(has_function_privilege('authenticated','public.duplicate_pedido_template(uuid,uuid,text)','EXECUTE'),
  'Authenticated can call duplicate RPC');
SELECT ok(has_function_privilege('authenticated','public.instantiate_pedido_template(uuid,jsonb)','EXECUTE'),
  'Authenticated can call instantiate RPC');
SELECT ok(NOT has_table_privilege('authenticated','public.pedido_templates','UPDATE'),
  'Template table still rejects direct authenticated updates');

SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;

CREATE TEMP TABLE qa_template_result(payload jsonb);
INSERT INTO qa_template_result SELECT public.save_pedido_template(
  '10000001-0000-4000-8000-000000000001',
  '{"id":null,"name":"Instalação","expectedVersion":null,"definition":{
    "schemaVersion":1,
    "fronts":[{"key":"geral","name":"Geral","position":0},{"key":"campo","name":"Campo","position":1}],
    "tasks":[
      {"key":"visita","frontKey":"campo","title":"Visita","description":"Ir ao local","priority":"Alta",
       "dueRule":{"kind":"creation","offsetDays":2},"followUpRule":{"kind":"creation","offsetDays":3}},
      {"key":"entrega","frontKey":"geral","title":"Entrega","description":null,"priority":"Normal",
       "dueRule":null,"followUpRule":null}],
    "subtasks":[{"key":"fotos","taskKey":"visita","title":"Registrar fotos","priority":"Baixa",
      "dueRule":{"kind":"creation","offsetDays":1}}],
    "dependencies":[{"taskKey":"entrega","predecessorKey":"visita"}]}}'::jsonb
);
SELECT is((SELECT payload->>'name' FROM qa_template_result),'Instalação','Save returns the created template');
SELECT is((SELECT (payload->>'version')::int FROM qa_template_result),1,'New template starts at version one');

CREATE TEMP TABLE qa_ids AS SELECT
  (SELECT (payload->>'id')::uuid FROM qa_template_result) AS template_id,
  '10000009-0000-4000-8000-000000000001'::uuid AS request_id;

UPDATE qa_template_result SET payload=public.save_pedido_template(
  '10000001-0000-4000-8000-000000000001',
  jsonb_build_object(
    'id',(SELECT template_id FROM qa_ids),'name','Instalação revisada','expectedVersion',1,
    'definition',(SELECT definition FROM public.pedido_templates WHERE id=(SELECT template_id FROM qa_ids))
  )
);
SELECT is((SELECT (payload->>'version')::int FROM qa_template_result),2,'Editing increments the version');
SELECT throws_ok($sql$SELECT public.save_pedido_template(
  '10000001-0000-4000-8000-000000000001',jsonb_build_object(
    'id',(SELECT template_id FROM qa_ids),'name','Edição obsoleta','expectedVersion',1,
    'definition',(SELECT definition FROM public.pedido_templates WHERE id=(SELECT template_id FROM qa_ids))
  ))$sql$,'40001',NULL,'Stale expectedVersion is rejected');

SELECT lives_ok($sql$SELECT public.duplicate_pedido_template(
  '10000001-0000-4000-8000-000000000001',(SELECT template_id FROM qa_ids),'Instalação cópia'
)$sql$,'Authorized member duplicates a template');
SELECT is((SELECT count(*)::int FROM public.pedido_templates
  WHERE organization_id='10000001-0000-4000-8000-000000000001'),2,
  'Duplication creates one independent template');

SELECT throws_ok($sql$SELECT public.save_pedido_template(
  '10000001-0000-4000-8000-000000000001',
  '{"id":null,"name":"Completion bloqueado","expectedVersion":null,"definition":{
    "schemaVersion":1,"fronts":[{"key":"f","name":"F","position":0}],
    "tasks":[
      {"key":"a","frontKey":"f","title":"A","description":null,"priority":"Normal","dueRule":null,"followUpRule":null},
      {"key":"b","frontKey":"f","title":"B","description":null,"priority":"Normal",
       "dueRule":{"kind":"completion","sourceTaskKey":"a","offsetDays":1},"followUpRule":null}],
    "subtasks":[],"dependencies":[]}}'::jsonb
)$sql$,'55000',NULL,'Completion-relative templates stay blocked until 4C');

CREATE TEMP TABLE qa_instance(order_id uuid);
INSERT INTO qa_instance SELECT public.instantiate_pedido_template(
  '10000001-0000-4000-8000-000000000001',jsonb_build_object(
    'templateId',(SELECT template_id FROM qa_ids),'expectedVersion',2,
    'requestId',(SELECT request_id FROM qa_ids),'timeZone','America/Sao_Paulo',
    'order',jsonb_build_object(
      'number','QA-M10-1','title','Pedido por template','client','Cliente QA','address','Rua QA',
      'legacyPriority','Normal','utilityDueDate',NULL,'cep','01000-000'
    )
  )
);
SELECT is((SELECT count(*)::int FROM public.pedidos WHERE id=(SELECT order_id FROM qa_instance)),1,
  'Instantiation creates one order');
SELECT is((SELECT count(*)::int FROM public.pedido_frentes WHERE pedido_id=(SELECT order_id FROM qa_instance)),2,
  'Instantiation creates all fronts without an extra default');
SELECT is((SELECT count(*)::int FROM public.tarefas WHERE pedido_id=(SELECT order_id FROM qa_instance)),2,
  'Instantiation creates all tasks');
SELECT is((SELECT count(*)::int FROM public.subtarefas s JOIN public.tarefas t ON t.id=s.tarefa_id
  WHERE t.pedido_id=(SELECT order_id FROM qa_instance)),1,'Instantiation creates all subtasks');
SELECT is((SELECT count(*)::int FROM public.tarefa_dependencias
  WHERE pedido_id=(SELECT order_id FROM qa_instance)),1,'Dependencies reference the new task IDs');
SELECT is((SELECT count(*)::int FROM public.tarefas
  WHERE pedido_id=(SELECT order_id FROM qa_instance) AND responsavel_user_id='10000000-0000-4000-8000-000000000001'
    AND status='Aberta' AND concluido=false AND waiting_type IS NULL),2,
  'Generated tasks start open and assigned to the creator');
SELECT is((SELECT vencimento FROM public.tarefas
  WHERE pedido_id=(SELECT order_id FROM qa_instance) AND descricao='Visita'),
  ((transaction_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date+2),
  'D+n task due date uses the server local creation date');
SELECT is((SELECT follow_up_date FROM public.tarefas
  WHERE pedido_id=(SELECT order_id FROM qa_instance) AND descricao='Visita'),
  ((transaction_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date+3),
  'D+n follow-up uses calendar days');
SELECT is((SELECT s.vencimento FROM public.subtarefas s JOIN public.tarefas t ON t.id=s.tarefa_id
  WHERE t.pedido_id=(SELECT order_id FROM qa_instance)),
  ((transaction_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date+1),
  'D+n subtask due date uses calendar days');
SELECT ok((SELECT template_request_fingerprint IS NOT NULL FROM public.pedidos
  WHERE id=(SELECT order_id FROM qa_instance)),'Instance persists a request fingerprint');

UPDATE qa_template_result SET payload=public.save_pedido_template(
  '10000001-0000-4000-8000-000000000001',jsonb_build_object(
    'id',(SELECT template_id FROM qa_ids),'name','Instalação alterada','expectedVersion',2,
    'definition',jsonb_set(
      (SELECT definition FROM public.pedido_templates WHERE id=(SELECT template_id FROM qa_ids)),
      '{tasks,0,title}','"Visita alterada no blueprint"'::jsonb
    )
  )
);
SELECT is((SELECT (payload->>'version')::int FROM qa_template_result),3,
  'Editing after instantiation creates another template version');
SELECT is((SELECT descricao FROM public.tarefas
  WHERE pedido_id=(SELECT order_id FROM qa_instance) AND descricao='Visita'),'Visita',
  'Editing the blueprint does not mutate an existing instance');

SELECT is(public.instantiate_pedido_template(
  '10000001-0000-4000-8000-000000000001',jsonb_build_object(
    'templateId',(SELECT template_id FROM qa_ids),'expectedVersion',2,
    'requestId',(SELECT request_id FROM qa_ids),'timeZone','America/Sao_Paulo',
    'order',jsonb_build_object(
      'number','QA-M10-1','title','Pedido por template','client','Cliente QA','address','Rua QA',
      'legacyPriority','Normal','utilityDueDate',NULL,'cep','01000-000'
    )
  )),(SELECT order_id FROM qa_instance),'Retry returns the same order id');
SELECT is((SELECT count(*)::int FROM public.pedidos
  WHERE template_request_id=(SELECT request_id FROM qa_ids)),1,'Retry does not duplicate the order');
SELECT throws_ok($sql$SELECT public.instantiate_pedido_template(
  '10000001-0000-4000-8000-000000000001',jsonb_build_object(
    'templateId',(SELECT template_id FROM qa_ids),'expectedVersion',2,
    'requestId',(SELECT request_id FROM qa_ids),'timeZone','America/Sao_Paulo',
    'order',jsonb_build_object(
      'number','QA-M10-DIFFERENT','title','Payload diferente','client','Cliente QA','address','Rua QA',
      'legacyPriority','Normal','utilityDueDate',NULL
    )
  ))$sql$,'23505',NULL,'Same request id with another payload conflicts');

RESET ROLE;
CREATE FUNCTION pg_temp.fail_qa_template_subtask()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.descricao='Registrar fotos' THEN
    RAISE EXCEPTION 'Injected subtask failure';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_qa_template_subtask_failure
  BEFORE INSERT ON public.subtarefas FOR EACH ROW
  EXECUTE FUNCTION pg_temp.fail_qa_template_subtask();
SET LOCAL ROLE authenticated;
SELECT throws_ok($sql$SELECT public.instantiate_pedido_template(
  '10000001-0000-4000-8000-000000000001',jsonb_build_object(
    'templateId',(SELECT template_id FROM qa_ids),'expectedVersion',3,
    'requestId','10000009-0000-4000-8000-000000000005','timeZone','America/Sao_Paulo',
    'order',jsonb_build_object(
      'number','QA-M10-ROLLBACK','title','Rollback','client','Cliente QA','address','Rua QA',
      'legacyPriority','Normal','utilityDueDate',NULL)
  ))$sql$,'P0001','Injected subtask failure','A late subtask failure aborts the whole instance');
RESET ROLE;
DROP TRIGGER zz_qa_template_subtask_failure ON public.subtarefas;
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM public.pedidos
  WHERE organization_id='10000001-0000-4000-8000-000000000001'),1,
  'Late failure leaves no partial Pedido');
SELECT is((SELECT count(*)::int FROM public.tarefas
  WHERE organization_id='10000001-0000-4000-8000-000000000001'),2,
  'Late failure leaves no partial tasks');

SELECT throws_ok($sql$SELECT public.instantiate_pedido_template(
  '10000001-0000-4000-8000-000000000001',jsonb_build_object(
    'templateId',(SELECT template_id FROM qa_ids),'expectedVersion',1,
    'requestId','10000009-0000-4000-8000-000000000002','timeZone','America/Sao_Paulo',
    'order',jsonb_build_object('number','QA-STALE','title','Stale','client','C','address','R',
      'legacyPriority','Normal','utilityDueDate',NULL)
  ))$sql$,'40001',NULL,'Instantiation rejects a stale template version');
SELECT throws_ok($sql$SELECT public.instantiate_pedido_template(
  '10000001-0000-4000-8000-000000000001',jsonb_build_object(
    'templateId',(SELECT template_id FROM qa_ids),'expectedVersion',2,
    'requestId','10000009-0000-4000-8000-000000000003','timeZone','Invalid/Zone',
    'order',jsonb_build_object('number','QA-TZ','title','TZ','client','C','address','R',
      'legacyPriority','Normal','utilityDueDate',NULL)
  ))$sql$,'22023',NULL,'Instantiation requires an IANA timezone');
SELECT throws_ok($sql$SELECT public.instantiate_pedido_template(
  '10000001-0000-4000-8000-000000000002',jsonb_build_object(
    'templateId',(SELECT template_id FROM qa_ids),'expectedVersion',2,
    'requestId','10000009-0000-4000-8000-000000000004','timeZone','America/Sao_Paulo',
    'order',jsonb_build_object('number','QA-CROSS','title','Cross','client','C','address','R',
      'legacyPriority','Normal','utilityDueDate',NULL)
  ))$sql$,'42501',NULL,'Caller cannot instantiate in another tenant');

RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.pedidos
  WHERE organization_id='10000001-0000-4000-8000-000000000001'),1,
  'Failed commands leave no partial orders');
SELECT is((SELECT count(*)::int FROM public.tarefas t
  LEFT JOIN public.pedido_frentes f ON f.organization_id=t.organization_id
    AND f.pedido_id=t.pedido_id AND f.id=t.frente_id
  WHERE t.pedido_id=(SELECT order_id FROM qa_instance) AND f.id IS NULL),0,
  'Every generated task points to a generated front');
SELECT * FROM finish();
ROLLBACK;
