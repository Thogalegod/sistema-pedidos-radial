-- Disposable local database only. M15 events and tenant/context invariants.
\set ON_ERROR_STOP on
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT no_plan();

SELECT has_table('public','pedido_eventos','Events table exists');
SELECT col_is_null('public','pedido_eventos','pedido_id','Standalone events are allowed');
SELECT ok(NOT has_table_privilege('anon','public.pedido_eventos','SELECT'),'Anon cannot read events');
SELECT ok(NOT has_table_privilege('anon','public.pedido_eventos','INSERT'),'Anon cannot create events');
SELECT ok(NOT has_table_privilege('authenticated','public.pedido_eventos','TRUNCATE'),'Authenticated cannot truncate events');
SELECT ok(NOT has_table_privilege('authenticated','public.pedido_eventos','REFERENCES'),'Authenticated cannot reference events');
SELECT ok(NOT has_table_privilege('authenticated','public.pedido_eventos','TRIGGER'),'Authenticated cannot create event triggers');

INSERT INTO auth.users(id) VALUES
  ('15000000-0000-4000-8000-000000000001'),
  ('15000000-0000-4000-8000-000000000002');
INSERT INTO public.organizations(id,name,slug) VALUES
  ('15000001-0000-4000-8000-000000000001','Events A','events-a'),
  ('15000001-0000-4000-8000-000000000002','Events B','events-b');
INSERT INTO public.organization_members(organization_id,user_id,role,display_name) VALUES
  ('15000001-0000-4000-8000-000000000001','15000000-0000-4000-8000-000000000001','admin','A'),
  ('15000001-0000-4000-8000-000000000002','15000000-0000-4000-8000-000000000002','admin','B');
INSERT INTO public.customers(id,organization_id,legal_name,trade_name) VALUES
  ('15000005-0000-4000-8000-000000000001','15000001-0000-4000-8000-000000000001','Customer A','A'),
  ('15000005-0000-4000-8000-000000000002','15000001-0000-4000-8000-000000000001','Customer B','B');
INSERT INTO public.pedidos(id,organization_id,numero_pedido,projeto,cliente,endereco,prioridade,status,customer_id,created_by) VALUES
  ('15000002-0000-4000-8000-000000000001','15000001-0000-4000-8000-000000000001','EV-A1','A1','A','Rua','Normal','Em andamento','15000005-0000-4000-8000-000000000001','15000000-0000-4000-8000-000000000001'),
  ('15000002-0000-4000-8000-000000000002','15000001-0000-4000-8000-000000000001','EV-A2','A2','B','Rua','Normal','Em andamento','15000005-0000-4000-8000-000000000002','15000000-0000-4000-8000-000000000001');
INSERT INTO public.pedido_frentes(id,organization_id,pedido_id,nome,ordem,is_legacy_default) VALUES
  ('15000003-0000-4000-8000-000000000001','15000001-0000-4000-8000-000000000001','15000002-0000-4000-8000-000000000001','Origem',0,false),
  ('15000003-0000-4000-8000-000000000002','15000001-0000-4000-8000-000000000001','15000002-0000-4000-8000-000000000001','Destino',1,false),
  ('15000003-0000-4000-8000-000000000003','15000001-0000-4000-8000-000000000001','15000002-0000-4000-8000-000000000002','Outra',0,false);
INSERT INTO public.tarefas(id,organization_id,pedido_id,frente_id,descricao,status,prioridade,responsavel_user_id,concluido,created_by) VALUES
  ('15000004-0000-4000-8000-000000000001','15000001-0000-4000-8000-000000000001','15000002-0000-4000-8000-000000000001','15000003-0000-4000-8000-000000000001','A1','Aberta','Normal','15000000-0000-4000-8000-000000000001',false,'15000000-0000-4000-8000-000000000001'),
  ('15000004-0000-4000-8000-000000000002','15000001-0000-4000-8000-000000000001',NULL,NULL,'Avulsa','Aberta','Normal','15000000-0000-4000-8000-000000000001',false,'15000000-0000-4000-8000-000000000001');

SELECT set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.pedido_eventos(id,organization_id,tipo,titulo,data,horario)
VALUES('15000006-0000-4000-8000-000000000001','15000001-0000-4000-8000-000000000001',
  'meeting','Sem Pedido','2026-10-15','09:30');
SELECT is((SELECT responsavel_user_id FROM public.pedido_eventos WHERE id='15000006-0000-4000-8000-000000000001'),
  '15000000-0000-4000-8000-000000000001'::uuid,'Assignee defaults to creator');
SELECT throws_ok($sql$INSERT INTO public.pedido_eventos(organization_id,tipo,titulo,data,horario,frente_id)
  VALUES('15000001-0000-4000-8000-000000000001','visit','No order','2026-10-15','09:30',
  '15000003-0000-4000-8000-000000000001')$sql$,'23514',NULL,'Front without order is rejected');
SELECT throws_ok($sql$INSERT INTO public.pedido_eventos(organization_id,tipo,titulo,data,horario,pedido_id,tarefa_id)
  VALUES('15000001-0000-4000-8000-000000000001','visit','Wrong task','2026-10-15','09:30',
  '15000002-0000-4000-8000-000000000002','15000004-0000-4000-8000-000000000001')$sql$,
  '23514',NULL,'Task cannot be attached to another order');
SELECT throws_ok($sql$INSERT INTO public.pedido_eventos(organization_id,tipo,titulo,data,horario,pedido_id,customer_id)
  VALUES('15000001-0000-4000-8000-000000000001','visit','Wrong customer','2026-10-15','09:30',
  '15000002-0000-4000-8000-000000000001','15000005-0000-4000-8000-000000000002')$sql$,
  '23514',NULL,'Explicit customer cannot differ from order customer');
SELECT throws_ok($sql$INSERT INTO public.pedido_eventos(organization_id,tipo,titulo,data,horario,responsavel_user_id)
  VALUES('15000001-0000-4000-8000-000000000001','visit','Foreign assignee','2026-10-15','09:30',
  '15000000-0000-4000-8000-000000000002')$sql$,'23503',NULL,'Assignee must belong to the organization');
INSERT INTO public.pedido_eventos(id,organization_id,tipo,titulo,data,horario,tarefa_id,customer_id)
VALUES('15000006-0000-4000-8000-000000000002','15000001-0000-4000-8000-000000000001',
  'external_service','Task event','2026-10-16','10:00','15000004-0000-4000-8000-000000000001',
  '15000005-0000-4000-8000-000000000001'),
  ('15000006-0000-4000-8000-000000000003','15000001-0000-4000-8000-000000000001',
  'other','Standalone task','2026-10-17','11:00','15000004-0000-4000-8000-000000000002',NULL);
SELECT is((SELECT pedido_id FROM public.pedido_eventos WHERE id='15000006-0000-4000-8000-000000000002'),
  '15000002-0000-4000-8000-000000000001'::uuid,'Task order is derived');
SELECT is((SELECT frente_id FROM public.pedido_eventos WHERE id='15000006-0000-4000-8000-000000000002'),
  '15000003-0000-4000-8000-000000000001'::uuid,'Task Front is derived');
SELECT col_is_null('public','pedido_eventos','pedido_id','Order association remains optional');
SELECT is((SELECT pedido_id FROM public.pedido_eventos WHERE id='15000006-0000-4000-8000-000000000003'),
  NULL::uuid,'Standalone task keeps order null');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM public.pedido_eventos),0,'Other tenant cannot read events');
RESET ROLE;

SELECT throws_ok($sql$UPDATE public.pedidos SET customer_id='15000005-0000-4000-8000-000000000002'
  WHERE id='15000002-0000-4000-8000-000000000001'$sql$,
  '23514',NULL,'Changing order customer conflicts with explicitly linked event');
SELECT throws_ok($sql$DELETE FROM public.pedidos WHERE id='15000002-0000-4000-8000-000000000001'$sql$,
  '23503',NULL,'Order with events requires unlinking first');

SELECT set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.pedido_eventos(id,organization_id,tipo,titulo,data,horario,pedido_id,frente_id)
VALUES('15000006-0000-4000-8000-000000000004','15000001-0000-4000-8000-000000000001',
  'visit','Front visit','2026-10-18','12:00',
  '15000002-0000-4000-8000-000000000001','15000003-0000-4000-8000-000000000001');
SELECT throws_ok($sql$SELECT public.remove_pedido_front(
  '15000001-0000-4000-8000-000000000001','15000003-0000-4000-8000-000000000001',
  '15000003-0000-4000-8000-000000000002')$sql$,
  '23503',NULL,'Independent Front event must be unlinked before Front removal');
SELECT is((SELECT frente_id FROM public.tarefas WHERE id='15000004-0000-4000-8000-000000000001'),
  '15000003-0000-4000-8000-000000000001'::uuid,'Failed Front removal rolls task movement back');
UPDATE public.pedido_eventos SET frente_id=NULL
  WHERE id='15000006-0000-4000-8000-000000000004';
SELECT lives_ok($sql$SELECT public.remove_pedido_front(
  '15000001-0000-4000-8000-000000000001','15000003-0000-4000-8000-000000000001',
  '15000003-0000-4000-8000-000000000002')$sql$,'Moving a task Front also moves its Event');
RESET ROLE;
SELECT is((SELECT frente_id FROM public.pedido_eventos WHERE id='15000006-0000-4000-8000-000000000002'),
  '15000003-0000-4000-8000-000000000002'::uuid,'Task Event now points at destination Front');

SELECT * FROM finish();
ROLLBACK;
