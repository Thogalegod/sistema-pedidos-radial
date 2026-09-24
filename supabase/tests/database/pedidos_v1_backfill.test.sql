-- Local disposable database only. Entire transition and repeat execution roll back.
\set ON_ERROR_STOP on
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT no_plan();
\ir ../helpers/pedidos-v1-fixtures.sql
\ir ../helpers/pedidos-v1-backfill-fixtures.sql
CREATE TEMP TABLE before_orders AS SELECT id,to_jsonb(p) AS row FROM public.pedidos p;
CREATE TEMP TABLE before_tasks AS SELECT id,to_jsonb(t) AS row FROM public.tarefas t;
CREATE TEMP TABLE before_other AS
 SELECT 'subtarefas' AS source,id,to_jsonb(s) AS row FROM public.subtarefas s
 UNION ALL SELECT 'comentarios',id,to_jsonb(c) FROM public.comentarios_tarefa c
 UNION ALL SELECT 'atividades',id,to_jsonb(a)-'migration_key' FROM public.atividades a
 UNION ALL SELECT 'anexos',id,to_jsonb(a) FROM public.anexos a;
CREATE TEMP TABLE before_acl AS SELECT oid,relacl,relrowsecurity FROM pg_class
 WHERE oid IN('public.pedidos'::regclass,'public.tarefas'::regclass,'public.subtarefas'::regclass,
 'public.comentarios_tarefa'::regclass,'public.atividades'::regclass,'public.anexos'::regclass);
\if :{?backfill_apply_m04}
  \ir ../../migrations/20260923200300_pedidos_v1_backfill.sql
\endif
SELECT has_column('public','atividades','migration_key','Migration provenance has a deduplication key');
SELECT has_function('private','backfill_pedidos_v1',ARRAY[]::text[],'Migration-only backfill is available');
SELECT to_regprocedure('private.backfill_pedidos_v1()') IS NOT NULL AS ready \gset
\if :ready
SELECT lives_ok('SELECT private.backfill_pedidos_v1()','Backfill can execute/repeat');
SELECT is((SELECT count(*)::int FROM public.pedido_frentes WHERE is_legacy_default),7,'Every existing order has one Geral, including empty orders');
SELECT is((SELECT count(*)::int FROM public.pedido_frentes),8,'Existing custom front preserved');
SELECT is((SELECT count(*)::int FROM public.tarefas WHERE frente_id IS NULL),0,'All tasks linked');
SELECT is((SELECT count(*)::int FROM public.tarefas WHERE updated_at IS NULL),4,'Four unknown timestamps remain unknown');
SELECT is((SELECT count(*)::int FROM public.tarefas WHERE responsavel IS NOT NULL AND responsavel_user_id IS NULL),4,'No name-based identity inference');
SELECT results_eq($$SELECT id,to_jsonb(t)-ARRAY['frente_id','status'] FROM public.tarefas t ORDER BY id$$,
 $$SELECT id,row-ARRAY['frente_id','status'] FROM before_tasks ORDER BY id$$,'All original task fields including identity, due/completion/update dates preserved');
SELECT is((SELECT frente_id::text FROM public.tarefas WHERE id='05000003-0000-4000-8000-000000000006'),
 '05000007-0000-4000-8000-000000000001','Existing custom task/front link preserved');
SELECT results_eq($$SELECT id,to_jsonb(p)-'status' FROM public.pedidos p ORDER BY id$$,
 $$SELECT id,row-'status' FROM before_orders ORDER BY id$$,'Only order status changes');
SELECT results_eq($$SELECT status FROM public.pedidos ORDER BY id$$,
 $$SELECT value FROM(VALUES(1,'Em andamento'::text),(2,'Em andamento'),(3,'Finalizado'),(4,'Em andamento'),(5,'Em andamento'),(6,'Finalizado'),(7,'Cancelado'))q(n,value) ORDER BY n$$,'Seven legacy/canonical order states normalize without reopening cancelled orders');
SELECT is((SELECT count(*)::int FROM public.tarefas WHERE status IS DISTINCT FROM CASE WHEN concluido THEN 'Concluída' ELSE 'Aberta' END),0,'Boolean stays canonical in legacy mode');
SELECT is((SELECT count(*)::int FROM public.atividades WHERE migration_key IS NOT NULL),4,'Only converted orders receive provenance');
SELECT ok(NOT EXISTS(SELECT 1 FROM before_orders b WHERE b.row->>'status' IN('Ação Pendente','Aguardando Cliente','Prazo Concessionária','Concluído') AND NOT EXISTS(
 SELECT 1 FROM public.atividades a WHERE a.pedido_id=b.id AND a.migration_key='pedidos-v1-status:'||b.id
 AND a.descricao LIKE '%Status anterior: '||(b.row->>'status')||'%' AND a.descricao LIKE 'Migração V1 em %' AND a.usuario='Sistema' AND a.criado_em>=transaction_timestamp()
)),'Provenance names old status and explicitly labels migration time');
SELECT results_eq($$SELECT 'subtarefas'::text,id,to_jsonb(s) FROM public.subtarefas s
 UNION ALL SELECT 'comentarios',id,to_jsonb(c) FROM public.comentarios_tarefa c
 UNION ALL SELECT 'atividades',id,to_jsonb(a)-'migration_key' FROM public.atividades a WHERE migration_key IS NULL
 UNION ALL SELECT 'anexos',id,to_jsonb(a) FROM public.anexos a ORDER BY 1,2$$,
 $$SELECT source,id,row FROM before_other ORDER BY source,id$$,'Subtasks, unattached notes, activities and attachments preserved');
SELECT is((SELECT count(*)::int FROM public.subtarefas WHERE tarefa_id IS NULL),1,'Historical nullable parent preserved');
SELECT results_eq($$SELECT oid,relacl,relrowsecurity FROM pg_class WHERE oid IN(SELECT oid FROM before_acl) ORDER BY oid$$,
 $$SELECT oid,relacl,relrowsecurity FROM before_acl ORDER BY oid$$,'Original grants and RLS unchanged');
SELECT ok(NOT has_function_privilege(role_name,'private.backfill_pedidos_v1()','EXECUTE'),role_name||' cannot invoke backfill') FROM(VALUES('anon'),('authenticated'))r(role_name);
SELECT is((SELECT tgenabled::text FROM pg_trigger WHERE tgrelid='public.tarefas'::regclass AND tgname='tarefas_z_stamp_update'),'O','Timestamp trigger restored');
CREATE TEMP TABLE first_result AS
 SELECT 'pedidos' AS source,id,to_jsonb(p) AS row FROM public.pedidos p
 UNION ALL SELECT 'tarefas',id,to_jsonb(t) FROM public.tarefas t
 UNION ALL SELECT 'frentes',id,to_jsonb(f) FROM public.pedido_frentes f
 UNION ALL SELECT 'atividades',id,to_jsonb(a) FROM public.atividades a;
SELECT lives_ok('SELECT private.backfill_pedidos_v1()','Second backfill succeeds');
SELECT results_eq($$SELECT 'pedidos'::text,id,to_jsonb(p) FROM public.pedidos p
 UNION ALL SELECT 'tarefas',id,to_jsonb(t) FROM public.tarefas t
 UNION ALL SELECT 'frentes',id,to_jsonb(f) FROM public.pedido_frentes f
 UNION ALL SELECT 'atividades',id,to_jsonb(a) FROM public.atividades a ORDER BY 1,2$$,
 $$SELECT source,id,row FROM first_result ORDER BY source,id$$,'Second execution preserves exact counts, IDs and timestamps');
SELECT throws_ok($$INSERT INTO public.atividades(organization_id,pedido_id,descricao,usuario,migration_key)
 SELECT organization_id,pedido_id,descricao,usuario,migration_key FROM public.atividades WHERE migration_key IS NOT NULL LIMIT 1$$,
 '23505',NULL,'Provenance cannot duplicate the same tenant/key');
UPDATE private.pedidos_v1_rollout SET status_mode='v1';
SELECT throws_ok('SELECT private.backfill_pedidos_v1()','55000',NULL,'Backfill refuses execution after canonical workflow activation');
UPDATE private.pedidos_v1_rollout SET status_mode='legacy';
SELECT set_config('request.jwt.claim.sub','05000000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM public.atividades WHERE migration_key IS NOT NULL),1,'B sees only B provenance');
SELECT throws_ok('SELECT private.backfill_pedidos_v1()','42501',NULL,'API role cannot bypass migration boundary');
RESET ROLE;
-- Model a pre-existing violation of the NOT VALID historical membership FK.
SAVEPOINT invalid_identity;
ALTER TABLE public.tarefas DROP CONSTRAINT tarefas_responsavel_member_fkey;
ALTER TABLE public.tarefas DISABLE TRIGGER tarefas_z_stamp_update;
UPDATE public.tarefas SET responsavel_user_id='05000000-0000-4000-8000-000000000003'
 WHERE id='05000003-0000-4000-8000-000000000006';
ALTER TABLE public.tarefas ENABLE TRIGGER tarefas_z_stamp_update;
ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_responsavel_member_fkey
 FOREIGN KEY(organization_id,responsavel_user_id)
 REFERENCES public.organization_members(organization_id,user_id) ON DELETE RESTRICT NOT VALID;
SELECT throws_ok('SELECT private.backfill_pedidos_v1()','23503',NULL,'Invalid historical membership aborts without guessing a replacement');
SELECT is((SELECT responsavel_user_id::text FROM public.tarefas WHERE id='05000003-0000-4000-8000-000000000006'),
 '05000000-0000-4000-8000-000000000003','Invalid historical identity remains available for explicit repair');
RELEASE SAVEPOINT invalid_identity;
-- Restore the valid identity after checking the refusal; all fixtures still roll back.
UPDATE public.tarefas SET responsavel_user_id='05000000-0000-4000-8000-000000000002'
 WHERE id='05000003-0000-4000-8000-000000000006';
SELECT ok((SELECT updated_at>=transaction_timestamp() FROM public.tarefas
 WHERE id='05000003-0000-4000-8000-000000000006'),'Ordinary writes still receive timestamps after backfill');
\endif
SELECT * FROM finish();
ROLLBACK;
