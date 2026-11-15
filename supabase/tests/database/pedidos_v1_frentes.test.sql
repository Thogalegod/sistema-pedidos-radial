-- Local disposable database only. Fixtures and all mutations roll back.
-- Optional frentes_apply_m01 runs the actual expansion over existing rows.
\set ON_ERROR_STOP on
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();
\ir ../helpers/pedidos-v1-fixtures.sql
CREATE TEMP TABLE frentes_before_tasks AS SELECT id, to_jsonb(t) AS row FROM public.tarefas t;
\if :{?frentes_apply_m01}
  \ir ../../migrations/20260923200000_pedidos_v1_frentes_expand.sql
\endif

SELECT has_table('public','pedido_frentes','Frentes exist');
SELECT has_column('public','tarefas','frente_id','Tasks reference an existing Front');
SELECT to_regclass('public.pedido_frentes') IS NOT NULL AS fronts_exist \gset
\if :fronts_exist
SELECT col_is_null('public','tarefas','frente_id','Old tasks remain compatible during expansion');
SELECT results_eq(
  $$SELECT id,to_jsonb(t)-'frente_id' FROM public.tarefas t ORDER BY id$$,
  $$SELECT id,row-'frente_id' FROM frentes_before_tasks ORDER BY id$$,
  'Existing task fields are unchanged');
\if :{?frentes_apply_m01}
SELECT is((SELECT count(*)::int FROM public.pedido_frentes),0,'Expansion performs no Front backfill');
SELECT is((SELECT count(*)::int FROM public.tarefas WHERE frente_id IS NULL),2,'Expansion leaves existing tasks unassigned');
\endif
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.pedido_frentes'::regclass),'RLS enabled');
SELECT ok(has_table_privilege('authenticated','public.pedido_frentes',privilege),'authenticated retains '||privilege)
FROM (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) p(privilege);
SELECT ok(NOT has_table_privilege(role_name,'public.pedido_frentes',privilege),role_name||' cannot '||privilege)
FROM (VALUES ('anon'),('authenticated')) r(role_name)
CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege)
WHERE role_name='anon' OR privilege IN ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
 WHERE c.oid='public.pedido_frentes'::regclass AND a.grantee=0),'PUBLIC has no table grant');
SELECT ok(NOT has_function_privilege(role_name,'private.ensure_pedido_default_front(uuid,uuid)','EXECUTE'),role_name||' cannot call private helper')
FROM (VALUES ('anon'),('authenticated')) r(role_name);

INSERT INTO public.pedido_frentes(id,organization_id,pedido_id,nome,ordem) VALUES
 ('05000004-0000-4000-8000-000000000001','05000001-0000-4000-8000-000000000001','05000002-0000-4000-8000-000000000001','Manual A',1),
 ('05000004-0000-4000-8000-000000000002','05000001-0000-4000-8000-000000000001','05000002-0000-4000-8000-000000000002','Manual A2',1),
 ('05000004-0000-4000-8000-000000000003','05000001-0000-4000-8000-000000000002','05000002-0000-4000-8000-000000000003','Manual B',1);
-- Old nullable rows must not be assigned as a side effect of an unrelated UPDATE.
UPDATE public.tarefas SET frente_id=NULL WHERE id='05000003-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claim.sub','05000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT is(current_user::text,'authenticated','Behavior runs as a common member');
SELECT is((SELECT count(*)::int FROM public.pedido_frentes WHERE organization_id='05000001-0000-4000-8000-000000000002'),0,'A cannot read B fronts');
SELECT throws_ok($$INSERT INTO public.pedido_frentes(organization_id,pedido_id,nome) VALUES ('05000001-0000-4000-8000-000000000002','05000002-0000-4000-8000-000000000003','Forbidden')$$,'42501',NULL,'A cannot create B front');
SELECT throws_ok($$INSERT INTO public.pedido_frentes(organization_id,pedido_id,nome) VALUES ('05000001-0000-4000-8000-000000000001','05000002-0000-4000-8000-000000000003','Wrong parent')$$,'23503',NULL,'Front cannot reference another tenant order');
SELECT lives_ok($$UPDATE public.pedido_frentes SET nome='Renamed A',ordem=2 WHERE id='05000004-0000-4000-8000-000000000001'$$,'A can rename and reorder own front');
SELECT is((SELECT nome FROM public.pedido_frentes WHERE id='05000004-0000-4000-8000-000000000001'),'Renamed A','Front edit persisted');
SELECT throws_ok($$UPDATE public.pedido_frentes SET organization_id='05000001-0000-4000-8000-000000000002' WHERE id='05000004-0000-4000-8000-000000000001'$$,'42501',NULL,'WITH CHECK prevents tenant reassignment');
SELECT lives_ok($$UPDATE public.pedido_frentes SET nome='Forbidden' WHERE id='05000004-0000-4000-8000-000000000003'$$,'Invisible UPDATE is harmless');
SELECT lives_ok($$DELETE FROM public.pedido_frentes WHERE id='05000004-0000-4000-8000-000000000003'$$,'Invisible DELETE is harmless');
SELECT lives_ok($$UPDATE public.tarefas SET descricao='Old task edited' WHERE id='05000003-0000-4000-8000-000000000001'$$,'Old task editing remains available');
SELECT ok((SELECT frente_id IS NULL FROM public.tarefas WHERE id='05000003-0000-4000-8000-000000000001'),'Editing old task does not perform backfill');

SELECT lives_ok($$INSERT INTO public.tarefas(organization_id,pedido_id,descricao) VALUES
 ('05000001-0000-4000-8000-000000000001','05000002-0000-4000-8000-000000000002','Legacy one'),
 ('05000001-0000-4000-8000-000000000001','05000002-0000-4000-8000-000000000002','Legacy two')$$,'Legacy INSERT without front succeeds');
SELECT is((SELECT count(*)::int FROM public.pedido_frentes WHERE pedido_id='05000002-0000-4000-8000-000000000002' AND is_legacy_default),1,'Two legacy INSERTs create only one default');
SELECT is((SELECT count(DISTINCT frente_id)::int FROM public.tarefas WHERE pedido_id='05000002-0000-4000-8000-000000000002'),1,'Both tasks use the same default');
SELECT is((SELECT nome FROM public.pedido_frentes WHERE pedido_id='05000002-0000-4000-8000-000000000002' AND is_legacy_default),'Geral','Default is named Geral');
SELECT throws_ok($$INSERT INTO public.tarefas(organization_id,pedido_id,frente_id,descricao) VALUES ('05000001-0000-4000-8000-000000000001','05000002-0000-4000-8000-000000000001','05000004-0000-4000-8000-000000000002','Wrong order')$$,'23503',NULL,'Task cannot use another order front in the same tenant');
SELECT throws_ok($$INSERT INTO public.tarefas(organization_id,pedido_id,frente_id,descricao) VALUES ('05000001-0000-4000-8000-000000000001','05000002-0000-4000-8000-000000000001','05000004-0000-4000-8000-000000000003','Wrong tenant')$$,'23503',NULL,'Task cannot use another tenant front');
SELECT throws_ok($$INSERT INTO public.tarefas(organization_id,pedido_id,descricao) VALUES ('05000001-0000-4000-8000-000000000002','05000002-0000-4000-8000-000000000003','Unauthorized legacy')$$,'42501',NULL,'Legacy trigger cannot bypass tenant checks');
SELECT lives_ok($$INSERT INTO public.tarefas(id,organization_id,pedido_id,frente_id,descricao) VALUES ('05000003-0000-4000-8000-000000000005','05000001-0000-4000-8000-000000000001','05000002-0000-4000-8000-000000000001','05000004-0000-4000-8000-000000000001','Explicit front')$$,'Explicit valid front remains accepted');
SELECT throws_ok($$DELETE FROM public.pedido_frentes WHERE id='05000004-0000-4000-8000-000000000001'$$,'23503',NULL,'Referenced front cannot be removed');
SELECT lives_ok($$DELETE FROM public.tarefas WHERE id='05000003-0000-4000-8000-000000000005'$$,'Task can be deleted');
SELECT lives_ok($$DELETE FROM public.pedido_frentes WHERE id='05000004-0000-4000-8000-000000000001'$$,'Unreferenced front can be removed');
SELECT is((SELECT count(*)::int FROM public.pedido_frentes WHERE id='05000004-0000-4000-8000-000000000001'),0,'Front deletion persisted');
SELECT lives_ok($$DELETE FROM public.pedidos WHERE id='05000002-0000-4000-8000-000000000002'$$,'Deleting an order without attachments cascades tasks and fronts');
SELECT is((SELECT count(*)::int FROM public.pedido_frentes WHERE pedido_id='05000002-0000-4000-8000-000000000002'),0,'Deleted order leaves no fronts');
SELECT is((SELECT count(*)::int FROM public.tarefas WHERE pedido_id='05000002-0000-4000-8000-000000000002'),0,'Deleted order leaves no tasks');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','05000000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT nome FROM public.pedido_frentes WHERE id='05000004-0000-4000-8000-000000000003'),'Manual B','B remains unchanged after denied A writes');
SELECT is((SELECT count(*)::int FROM public.pedido_frentes WHERE organization_id='05000001-0000-4000-8000-000000000001'),0,'B cannot read A');
RESET ROLE;
\endif
SELECT * FROM finish();
ROLLBACK;
