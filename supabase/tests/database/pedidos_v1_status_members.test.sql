-- Disposable local DB only; never run fixtures against a remote project.
\set ON_ERROR_STOP on
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT no_plan();
\ir ../helpers/pedidos-v1-fixtures.sql
-- Transition mode applies actual M02 over pre-existing rows, then rolls back.
\if :{?members_apply_m02}
  \ir ../../migrations/20260923200100_pedidos_v1_status_members_expand.sql
\endif
SELECT has_column('public','organization_members','display_name','Organization owns display names');
SELECT has_column('public','tarefas','status','Task status exists');
SELECT has_function('public','list_pedido_members',ARRAY['uuid'],'Tenant directory exists');
SELECT to_regprocedure('public.list_pedido_members(uuid)') IS NOT NULL AS ready \gset
\if :ready
SELECT col_is_null('public','tarefas','updated_at','Historical timestamp is nullable');
\if :{?members_apply_m02}
SELECT is((SELECT count(*)::int FROM public.tarefas WHERE updated_at IS NULL),2,'Expansion invents no historical timestamps');
SELECT is((SELECT count(*)::int FROM public.tarefas WHERE status IS NULL),2,'Expansion does not backfill status');
\endif
SELECT ok(NOT has_table_privilege('authenticated','public.organization_members','UPDATE'),'No direct membership writes');
SELECT ok(NOT has_table_privilege(role_name,'private.pedidos_v1_rollout',privilege),role_name||' cannot '||privilege||' rollout')
FROM (VALUES('anon'),('authenticated'))r(role_name)
CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN'))p(privilege);
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE c.oid='private.pedidos_v1_rollout'::regclass AND a.grantee=0),'PUBLIC has no rollout grants');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='private.pedidos_v1_rollout'::regclass),'Private rollout has RLS defense');
SELECT ok(NOT has_function_privilege('anon',signature,'EXECUTE'),'anon cannot invoke '||signature)
FROM (VALUES('public.list_pedido_members(uuid)'),('public.set_pedido_member_display_name(uuid,uuid,text)'),('public.assign_legacy_pedido_tasks(uuid,uuid[],uuid)'),('public.pedidos_v1_capabilities(uuid)'))f(signature);
SELECT is((SELECT count(*)::int FROM private.pedidos_v1_rollout),1,'Exactly one rollout row');
SELECT ok(NOT (SELECT convalidated FROM pg_constraint WHERE conname='tarefas_responsavel_member_fkey'),'Historical assignee validation deferred');

SELECT set_config('request.jwt.claim.sub','05000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM public.list_pedido_members('05000001-0000-4000-8000-000000000001')),2,'Common A member sees both A members');
SELECT is((SELECT count(*)::int FROM public.list_pedido_members('05000001-0000-4000-8000-000000000001') WHERE display_name IS NULL),2,'Names stay null before explicit naming');
SELECT results_eq($$SELECT user_id FROM public.list_pedido_members('05000001-0000-4000-8000-000000000001') ORDER BY user_id$$,$$SELECT id FROM (VALUES('05000000-0000-4000-8000-000000000001'::uuid),('05000000-0000-4000-8000-000000000002'::uuid))q(id) ORDER BY id$$,'Directory excludes other tenants');
SELECT throws_ok($$SELECT * FROM public.list_pedido_members('05000001-0000-4000-8000-000000000002')$$,'42501',NULL,'A cannot list B');
SELECT is(public.pedidos_v1_capabilities('05000001-0000-4000-8000-000000000001'),' {"statusMode":"legacy","timelineMode":"legacy"}'::jsonb,'Capabilities retain legacy writers');
SELECT throws_ok($$SELECT public.pedidos_v1_capabilities('05000001-0000-4000-8000-000000000002')$$,'42501',NULL,'Capabilities check membership');
SELECT throws_ok($$SELECT public.set_pedido_member_display_name('05000001-0000-4000-8000-000000000001','05000000-0000-4000-8000-000000000001','Synthetic')$$,'42501',NULL,'Common member cannot name admin');
SELECT throws_ok($$SELECT public.assign_legacy_pedido_tasks('05000001-0000-4000-8000-000000000001',ARRAY['05000003-0000-4000-8000-000000000001']::uuid[],'05000000-0000-4000-8000-000000000002')$$,'42501',NULL,'Common member cannot associate legacy tasks');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','05000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.set_pedido_member_display_name('05000001-0000-4000-8000-000000000001','05000000-0000-4000-8000-000000000001','Synthetic Name')$$,'Admin can name own member');
SELECT lives_ok($$SELECT public.set_pedido_member_display_name('05000001-0000-4000-8000-000000000001','05000000-0000-4000-8000-000000000002','Synthetic Name')$$,'Homonyms are allowed');
SELECT is((SELECT count(*)::int FROM public.list_pedido_members('05000001-0000-4000-8000-000000000001') WHERE display_name='Synthetic Name'),2,'Homonyms persist independently');
SELECT throws_ok($$SELECT public.set_pedido_member_display_name('05000001-0000-4000-8000-000000000001','05000000-0000-4000-8000-000000000003','Forbidden')$$,'23503',NULL,'Admin cannot name another tenant member');
SELECT throws_ok($$SELECT public.set_pedido_member_display_name('05000001-0000-4000-8000-000000000002','05000000-0000-4000-8000-000000000003','Forbidden')$$,'42501',NULL,'Admin A has no authority in B');
SELECT throws_ok(format('SELECT public.set_pedido_member_display_name(%L,%L,%L)','05000001-0000-4000-8000-000000000001','05000000-0000-4000-8000-000000000002',bad_name),'22023',NULL,'Invalid display name is rejected')
FROM (VALUES(''),('   '),(' leading'),(repeat('x',121)),(NULL::text))n(bad_name);
SELECT lives_ok($$UPDATE public.tarefas SET responsavel='Unresolved legacy' WHERE id='05000003-0000-4000-8000-000000000001'$$,'Prepare legacy text');
SELECT throws_ok($$SELECT public.assign_legacy_pedido_tasks('05000001-0000-4000-8000-000000000001',ARRAY['05000003-0000-4000-8000-000000000001','05000003-0000-4000-8000-000000000003']::uuid[],'05000000-0000-4000-8000-000000000002')$$,'23503',NULL,'Mixed tenant batch rejected atomically');
SELECT ok((SELECT responsavel_user_id IS NULL FROM public.tarefas WHERE id='05000003-0000-4000-8000-000000000001'),'Rejected batch leaves own task unchanged');
SELECT throws_ok($$SELECT public.assign_legacy_pedido_tasks('05000001-0000-4000-8000-000000000001',ARRAY['05000003-0000-4000-8000-000000000001']::uuid[],'05000000-0000-4000-8000-000000000003')$$,'23503',NULL,'Cannot assign external member');
SELECT throws_ok($$SELECT public.assign_legacy_pedido_tasks('05000001-0000-4000-8000-000000000001',ARRAY[NULL]::uuid[],'05000000-0000-4000-8000-000000000002')$$,'22023',NULL,'Null IDs rejected');
SELECT is(public.assign_legacy_pedido_tasks('05000001-0000-4000-8000-000000000001',ARRAY['05000003-0000-4000-8000-000000000001','05000003-0000-4000-8000-000000000001']::uuid[],'05000000-0000-4000-8000-000000000002'),1,'Explicit assignment deduplicates IDs');
SELECT is((SELECT responsavel FROM public.tarefas WHERE id='05000003-0000-4000-8000-000000000001'),'Unresolved legacy','Assignment preserves legacy text');
SELECT is(public.assign_legacy_pedido_tasks('05000001-0000-4000-8000-000000000001',ARRAY['05000003-0000-4000-8000-000000000001']::uuid[],'05000000-0000-4000-8000-000000000001'),0,'Repeated association never overwrites resolved identity');

SELECT lives_ok($$INSERT INTO public.tarefas(id,organization_id,pedido_id,descricao) VALUES('05000003-0000-4000-8000-000000000010','05000001-0000-4000-8000-000000000001','05000002-0000-4000-8000-000000000002','Legacy compatible')$$,'Legacy INSERT works');
SELECT is((SELECT status FROM public.tarefas WHERE id='05000003-0000-4000-8000-000000000010'),'Aberta','Bool derives open status');
SELECT is((SELECT prioridade FROM public.tarefas WHERE id='05000003-0000-4000-8000-000000000010'),'Normal','Default priority is Normal');
SELECT ok((SELECT updated_at IS NOT NULL FROM public.tarefas WHERE id='05000003-0000-4000-8000-000000000010'),'New task gets real timestamp');
SELECT lives_ok(format('UPDATE public.pedidos SET status=%L WHERE id=%L',order_status,'05000002-0000-4000-8000-000000000002'),'Expanded order status accepted: '||order_status)
FROM (VALUES('Ação Pendente'),('Aguardando Cliente'),('Prazo Concessionária'),('Concluído'),('Em andamento'),('Finalizado'),('Cancelado'))s(order_status);
SELECT lives_ok($$UPDATE public.tarefas SET concluido=true WHERE id='05000003-0000-4000-8000-000000000010'$$,'Legacy completion works');
SELECT is((SELECT status FROM public.tarefas WHERE id='05000003-0000-4000-8000-000000000010'),'Concluída','Completion derives status');
SELECT lives_ok($$UPDATE public.tarefas SET concluido=false WHERE id='05000003-0000-4000-8000-000000000010'$$,'Legacy reopen works');
SELECT throws_ok($$UPDATE public.tarefas SET status='Concluída' WHERE id='05000003-0000-4000-8000-000000000010'$$,'23514',NULL,'Status cannot become a second source of truth');
SELECT throws_ok($$UPDATE public.tarefas SET status='Aguardando' WHERE id='05000003-0000-4000-8000-000000000010'$$,'23514',NULL,'Premature workflow activation rejected');
SELECT throws_ok($$UPDATE public.tarefas SET waiting_type='internal_user' WHERE id='05000003-0000-4000-8000-000000000010'$$,'23514',NULL,'Internal wait requires user');
SELECT throws_ok($$UPDATE public.tarefas SET waiting_user_id='05000000-0000-4000-8000-000000000001' WHERE id='05000003-0000-4000-8000-000000000010'$$,'23514',NULL,'User without wait type rejected');
SELECT throws_ok($$UPDATE public.tarefas SET waiting_type='internal_user',waiting_user_id='05000000-0000-4000-8000-000000000003' WHERE id='05000003-0000-4000-8000-000000000010'$$,'23503',NULL,'Internal wait cannot cross tenant');
SELECT throws_ok($$UPDATE public.tarefas SET waiting_type='Thomás' WHERE id='05000003-0000-4000-8000-000000000010'$$,'23514',NULL,'People names are not wait categories');
SELECT lives_ok($$UPDATE public.tarefas SET waiting_type='internal_user',waiting_user_id='05000000-0000-4000-8000-000000000001' WHERE id='05000003-0000-4000-8000-000000000010'$$,'Valid same tenant wait reference');
SELECT throws_ok($$UPDATE public.tarefas SET responsavel_user_id='05000000-0000-4000-8000-000000000003' WHERE id='05000003-0000-4000-8000-000000000010'$$,'23503',NULL,'New assignee must be member');
SELECT throws_ok($$UPDATE public.tarefas SET prioridade='Invalid' WHERE id='05000003-0000-4000-8000-000000000010'$$,'23514',NULL,'Invalid priority rejected');
RESET ROLE;
-- Pure schema constraints for future workflow states, before the writer switch.
ALTER TABLE public.tarefas DISABLE TRIGGER tarefas_sync_legacy_state;
SELECT throws_ok($$UPDATE public.tarefas SET status='Aguardando',waiting_type=NULL,waiting_user_id=NULL WHERE id='05000003-0000-4000-8000-000000000010'$$,'23514',NULL,'Schema itself requires wait type for waiting status');
UPDATE public.tarefas SET status='Aguardando' WHERE id='05000003-0000-4000-8000-000000000010';
ALTER TABLE public.tarefas ENABLE TRIGGER tarefas_sync_legacy_state;
SELECT throws_ok($$DELETE FROM public.organization_members WHERE organization_id='05000001-0000-4000-8000-000000000001' AND user_id='05000000-0000-4000-8000-000000000001'$$,'23503',NULL,'Referenced waiting member cannot be removed');
SELECT throws_ok($$DELETE FROM public.organization_members WHERE organization_id='05000001-0000-4000-8000-000000000001' AND user_id='05000000-0000-4000-8000-000000000002'$$,'23503',NULL,'Referenced assignee cannot be removed');
SET LOCAL ROLE authenticated;
UPDATE public.tarefas SET concluido=true WHERE id='05000003-0000-4000-8000-000000000010';
SELECT ok((SELECT waiting_type IS NULL AND waiting_user_id IS NULL AND waiting_note IS NULL FROM public.tarefas WHERE id='05000003-0000-4000-8000-000000000010'),'Leaving wait clears active fields');
RESET ROLE;
CREATE TEMP TABLE before_noop AS SELECT updated_at FROM public.tarefas WHERE id='05000003-0000-4000-8000-000000000010';
SET LOCAL ROLE authenticated;
UPDATE public.tarefas SET descricao=descricao WHERE id='05000003-0000-4000-8000-000000000010';
RESET ROLE;
SELECT is((SELECT updated_at FROM public.tarefas WHERE id='05000003-0000-4000-8000-000000000010'),(SELECT updated_at FROM before_noop),'No-op keeps timestamp');
SELECT set_config('request.jwt.claim.sub','05000000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT * FROM public.list_pedido_members('05000001-0000-4000-8000-000000000001')$$,'42501',NULL,'B cannot list A');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT * FROM public.list_pedido_members('05000001-0000-4000-8000-000000000001')$$,'42501',NULL,'JWT required despite authenticated role');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT * FROM public.list_pedido_members('05000001-0000-4000-8000-000000000001')$$,'42501',NULL,'anon cannot call directory');
RESET ROLE;
\endif
SELECT * FROM finish();
ROLLBACK;
