-- Disposable local DB only. M13 idempotent historical backfill.
\set ON_ERROR_STOP on
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT no_plan();

SELECT has_function('private','project_pedido_legacy_comment_row',ARRAY['uuid','uuid'],'Reusable projector exists');
SELECT ok(NOT has_function_privilege('authenticated','private.project_pedido_legacy_comment_row(uuid,uuid)','EXECUTE'),
  'Projector is private');

INSERT INTO auth.users(id) VALUES ('13000000-0000-4000-8000-000000000001');
INSERT INTO public.organizations(id,name,slug) VALUES ('13000001-0000-4000-8000-000000000001','Backfill QA','backfill-qa');
INSERT INTO public.organization_members(organization_id,user_id,role,display_name) VALUES
  ('13000001-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','admin','Backfill Admin');
INSERT INTO public.pedidos(id,organization_id,numero_pedido,projeto,cliente,endereco,prioridade,status,created_by)
  VALUES('13000002-0000-4000-8000-000000000001','13000001-0000-4000-8000-000000000001','QA-13','Backfill','Cliente','Rua','Normal','Em andamento','13000000-0000-4000-8000-000000000001');
INSERT INTO public.pedido_frentes(id,organization_id,pedido_id,nome,ordem,is_legacy_default) VALUES
  ('13000003-0000-4000-8000-000000000001','13000001-0000-4000-8000-000000000001','13000002-0000-4000-8000-000000000001','Geral',0,false);
INSERT INTO public.tarefas(id,organization_id,pedido_id,frente_id,descricao,status,prioridade,responsavel_user_id,concluido,created_by) VALUES
  ('13000004-0000-4000-8000-000000000001','13000001-0000-4000-8000-000000000001','13000002-0000-4000-8000-000000000001','13000003-0000-4000-8000-000000000001','Pedido','Aberta','Normal','13000000-0000-4000-8000-000000000001',false,'13000000-0000-4000-8000-000000000001'),
  ('13000004-0000-4000-8000-000000000002','13000001-0000-4000-8000-000000000001',NULL,NULL,'Avulsa','Aberta','Normal','13000000-0000-4000-8000-000000000001',false,'13000000-0000-4000-8000-000000000001');

UPDATE private.pedidos_v1_rollout SET timeline_mode='legacy' WHERE singleton;
INSERT INTO public.comentarios_tarefa(id,organization_id,tarefa_id,texto,usuario,user_id,criado_em) VALUES
  ('13000005-0000-4000-8000-000000000001','13000001-0000-4000-8000-000000000001','13000004-0000-4000-8000-000000000001','Nota antiga','Autor legado',NULL,'2026-09-01 12:00Z'),
  ('13000005-0000-4000-8000-000000000002','13000001-0000-4000-8000-000000000001','13000004-0000-4000-8000-000000000002','Nota avulsa','Outro autor',NULL,'2026-09-01 12:00Z');
UPDATE private.pedidos_v1_rollout SET timeline_mode='copying' WHERE singleton;
SELECT private.project_pedido_legacy_comment_row(organization_id,id) FROM public.comentarios_tarefa
  WHERE organization_id='13000001-0000-4000-8000-000000000001' ORDER BY criado_em,id;
SELECT private.project_pedido_legacy_comment_row(organization_id,id) FROM public.comentarios_tarefa
  WHERE organization_id='13000001-0000-4000-8000-000000000001' ORDER BY criado_em,id;

SELECT is((SELECT count(*)::int FROM public.atividades WHERE organization_id='13000001-0000-4000-8000-000000000001'),2,
  'Two executions keep one projection per comment');
SELECT is((SELECT count(*)::int FROM public.atividades WHERE tarefa_id='13000004-0000-4000-8000-000000000002' AND pedido_id IS NULL),1,
  'Standalone note is copied with null Pedido');
SELECT is((SELECT count(*)::int FROM public.atividades WHERE user_id IS NULL AND usuario IN ('Autor legado','Outro autor')),2,
  'Readable legacy author is preserved when user id is null');
SELECT is((SELECT string_agg(source_comment_id::text,',' ORDER BY criado_em,source_comment_id) FROM public.atividades
  WHERE organization_id='13000001-0000-4000-8000-000000000001'),
  '13000005-0000-4000-8000-000000000001,13000005-0000-4000-8000-000000000002',
  'Timestamp ties retain deterministic source id order');
SELECT is((SELECT count(*)::int FROM public.comentarios_tarefa c JOIN public.atividades a
  ON a.organization_id=c.organization_id AND a.source_comment_id=c.id
  WHERE (a.descricao,a.usuario,a.user_id,a.criado_em) IS DISTINCT FROM (c.texto,c.usuario,c.user_id,c.criado_em)),0,
  'Backfill preserves content identity');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000001',true);
DELETE FROM public.comentarios_tarefa WHERE id='13000005-0000-4000-8000-000000000001';
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.atividades WHERE source_comment_id='13000005-0000-4000-8000-000000000001'),0,
  'Deleting legacy note removes its backfill projection');
SELECT * FROM finish();
ROLLBACK;
