-- Disposable local DB only. M12 timeline expansion and delta capture.
\set ON_ERROR_STOP on
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT no_plan();

SELECT has_column('public','atividades','source_comment_id','Timeline provenance exists');
SELECT col_is_null('public','atividades','pedido_id','Timeline permits standalone task events');
SELECT is((SELECT timeline_mode FROM private.pedidos_v1_rollout WHERE singleton),'copying','M12 activates copying atomically');

INSERT INTO auth.users(id) VALUES ('12000000-0000-4000-8000-000000000001');
INSERT INTO public.organizations(id,name,slug) VALUES ('12000001-0000-4000-8000-000000000001','Timeline QA','timeline-qa');
INSERT INTO public.organization_members(organization_id,user_id,role,display_name) VALUES
  ('12000001-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','admin','Timeline Admin');
INSERT INTO public.pedidos(id,organization_id,numero_pedido,projeto,cliente,endereco,prioridade,status,created_by)
  VALUES('12000002-0000-4000-8000-000000000001','12000001-0000-4000-8000-000000000001','QA-12','Timeline','Cliente','Rua','Normal','Em andamento','12000000-0000-4000-8000-000000000001');
INSERT INTO public.pedido_frentes(id,organization_id,pedido_id,nome,ordem,is_legacy_default) VALUES
  ('12000003-0000-4000-8000-000000000001','12000001-0000-4000-8000-000000000001','12000002-0000-4000-8000-000000000001','Geral',0,false);
INSERT INTO public.tarefas(id,organization_id,pedido_id,frente_id,descricao,status,prioridade,responsavel_user_id,concluido,created_by,follow_up_date) VALUES
  ('12000004-0000-4000-8000-000000000001','12000001-0000-4000-8000-000000000001','12000002-0000-4000-8000-000000000001','12000003-0000-4000-8000-000000000001','Pedido task','Aberta','Normal','12000000-0000-4000-8000-000000000001',false,'12000000-0000-4000-8000-000000000001','2026-10-10'),
  ('12000004-0000-4000-8000-000000000002','12000001-0000-4000-8000-000000000001',NULL,NULL,'Avulsa','Aberta','Normal','12000000-0000-4000-8000-000000000001',false,'12000000-0000-4000-8000-000000000001',NULL);

SELECT set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.comentarios_tarefa(id,organization_id,tarefa_id,texto,usuario,user_id,criado_em) VALUES
  ('12000005-0000-4000-8000-000000000001','12000001-0000-4000-8000-000000000001','12000004-0000-4000-8000-000000000001','Cliente respondeu','Timeline Admin','12000000-0000-4000-8000-000000000001','2026-10-01 12:00Z');
SELECT is((SELECT count(*)::int FROM public.atividades WHERE source_comment_id='12000005-0000-4000-8000-000000000001'),1,'New comment is projected once');
SELECT is((SELECT descricao||'|'||usuario||'|'||criado_em::text FROM public.atividades WHERE source_comment_id='12000005-0000-4000-8000-000000000001'),
  'Cliente respondeu|Timeline Admin|2026-10-01 12:00:00+00','Projection preserves text, author and timestamp');
SELECT is((SELECT follow_up_date FROM public.atividades WHERE source_comment_id='12000005-0000-4000-8000-000000000001'),'2026-10-10'::date,'Projection snapshots follow-up');
SELECT throws_ok($sql$INSERT INTO public.atividades(organization_id,pedido_id,descricao,usuario,tipo)
  VALUES('12000001-0000-4000-8000-000000000001','12000002-0000-4000-8000-000000000001','Forjado','X','system')$sql$,
  '42501',NULL,'Direct API cannot forge a system activity');
DELETE FROM public.comentarios_tarefa WHERE id='12000005-0000-4000-8000-000000000001';
SELECT is((SELECT count(*)::int FROM public.atividades WHERE source_comment_id='12000005-0000-4000-8000-000000000001'),0,'Deleting legacy note removes only its projection');
SELECT lives_ok($sql$SELECT public.update_pedido_task(
  '12000001-0000-4000-8000-000000000001','12000004-0000-4000-8000-000000000002',
  '{"title":"Avulsa revisada"}'::jsonb)$sql$,
  'Approved command projects standalone system event');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.atividades WHERE pedido_id IS NULL AND tarefa_id='12000004-0000-4000-8000-000000000002'),1,'Standalone event has task and null Pedido');
SELECT is((SELECT count(*)::int FROM public.atividades WHERE pedido_id IS NULL AND tarefa_id IS NULL),0,'No ownerless activities exist');
SELECT * FROM finish();
ROLLBACK;
