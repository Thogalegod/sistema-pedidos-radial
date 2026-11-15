BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT no_plan();

SELECT has_column('public', 'organization_members', 'can_manage_billing', 'organization membership has billing capability');
SELECT has_column('public', 'billing_cycles', 'needs_resend', 'billing cycle has resend latch');
SELECT has_column('public', 'billing_cycles', 'content_revision', 'billing cycle has content revision');
SELECT has_column('public', 'billing_cycles', 'boleto_change_pending', 'billing cycle has pending flag');
SELECT has_column('public', 'billing_cycles', 'boleto_change_operation_id', 'billing cycle has operation UUID');
SELECT has_column('public', 'billing_cycles', 'boleto_change_started_at', 'billing cycle has operation timestamp');
SELECT has_table('public', 'billing_delivery_events', 'billing delivery history exists');

SELECT ok(
  (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.billing_delivery_events'::regclass),
  'billing_delivery_events has RLS enabled'
);

SELECT ok(NOT has_table_privilege('authenticated', 'public.billing_cycles', 'INSERT'), 'no table-wide billing insert');
SELECT ok(NOT has_table_privilege('authenticated', 'public.billing_cycles', 'UPDATE'), 'no table-wide billing update');
SELECT ok(NOT has_column_privilege('authenticated', 'public.billing_cycles', 'sent_at', 'UPDATE'), 'sent_at is protected');
SELECT ok(NOT has_column_privilege('authenticated', 'public.billing_cycles', 'sequence_number', 'UPDATE'), 'sequence_number is immutable');
SELECT ok(has_column_privilege('authenticated', 'public.billing_cycles', 'needs_resend', 'UPDATE'), 'needs_resend supports monotonic updates');
SELECT ok(has_column_privilege('authenticated', 'public.billing_cycles', 'organization_id', 'INSERT'), 'organization_id is insertable');
SELECT ok(NOT has_column_privilege('authenticated', 'public.billing_cycles', 'sent_at', 'INSERT'), 'sent_at is not insertable');
SELECT ok(NOT has_table_privilege('authenticated', 'public.billing_lines', 'UPDATE'), 'billing lines have no table-wide update');
SELECT ok(NOT has_column_privilege('authenticated', 'public.billing_lines', 'id', 'UPDATE'), 'billing line id is immutable');
SELECT ok(NOT has_column_privilege('authenticated', 'public.billing_lines', 'created_at', 'UPDATE'), 'billing line creation time is immutable');
SELECT ok(has_column_privilege('authenticated', 'public.billing_lines', 'description', 'UPDATE'), 'billing line rendered content remains editable');
SELECT ok(has_column_privilege('authenticated', 'public.billing_lines', 'billing_cycle_id', 'UPDATE'), 'billing line movement remains editable');

SELECT has_schema('private');
SELECT ok(NOT has_schema_privilege('authenticated', 'private', 'USAGE'), 'authenticated cannot use private schema');
SELECT ok(NOT has_schema_privilege('anon', 'private', 'USAGE'), 'anon cannot use private schema');
SELECT ok(has_function_privilege('authenticated', 'public.begin_boleto_change(uuid,uuid,uuid,uuid)', 'EXECUTE'), 'authenticated can begin boleto change');
SELECT ok(NOT has_function_privilege('anon', 'public.begin_boleto_change(uuid,uuid,uuid,uuid)', 'EXECUTE'), 'anon cannot begin boleto change');
SELECT ok(has_function_privilege('authenticated', 'public.finish_boleto_change(uuid,uuid,uuid,uuid)', 'EXECUTE'), 'authenticated can finish boleto change');
SELECT ok(NOT has_function_privilege('anon', 'public.finish_boleto_change(uuid,uuid,uuid,uuid)', 'EXECUTE'), 'anon cannot finish boleto change');

SELECT is(
  (SELECT count(*)::integer FROM pg_catalog.pg_proc AS proc JOIN pg_catalog.pg_namespace AS ns ON ns.oid = proc.pronamespace
   WHERE ns.nspname = 'private' AND proc.proname IN (
     'guard_and_bump_billing_cycle_content_revision', 'bump_billing_line_content_revision',
     'bump_contract_content_revision', 'bump_customer_content_revision', 'bump_customer_site_content_revision'
   )),
  5,
  'all five trigger helpers are private'
);
SELECT ok(NOT (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = 'private.guard_and_bump_billing_cycle_content_revision()'::regprocedure), 'cycle guard is invoker');
SELECT is(
  (SELECT count(*)::integer FROM pg_catalog.pg_proc AS proc JOIN pg_catalog.pg_namespace AS ns ON ns.oid = proc.pronamespace
   WHERE ns.nspname = 'private' AND proc.proname LIKE 'bump_%_content_revision' AND proc.prosecdef),
  4,
  'cross-table trigger helpers are definers'
);
SELECT ok((SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = 'public.begin_boleto_change(uuid,uuid,uuid,uuid)'::regprocedure), 'begin is definer');
SELECT ok((SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = 'public.finish_boleto_change(uuid,uuid,uuid,uuid)'::regprocedure), 'finish is definer');
SELECT ok((SELECT proconfig @> ARRAY['search_path=""'] FROM pg_catalog.pg_proc WHERE oid = 'public.begin_boleto_change(uuid,uuid,uuid,uuid)'::regprocedure), 'begin has empty search_path');
SELECT ok((SELECT proconfig @> ARRAY['search_path=""'] FROM pg_catalog.pg_proc WHERE oid = 'public.finish_boleto_change(uuid,uuid,uuid,uuid)'::regprocedure), 'finish has empty search_path');

SELECT has_index('public', 'contracts', 'contracts_org_site_idx', 'contracts have organization/site fan-out index');
SELECT has_index('public', 'contract_documents', 'contract_documents_one_boleto_per_billing_uidx', 'one boleto per billing index exists');
SELECT is((SELECT count(*)::integer FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'billing_delivery_events' AND cmd = 'UPDATE'), 0, 'events have no update policy');
SELECT is((SELECT count(*)::integer FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'billing_delivery_events' AND cmd = 'DELETE'), 0, 'events have no delete policy');
SELECT is((SELECT count(*)::integer FROM pg_catalog.pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname ILIKE 'Boleto storage%' AND cmd = 'DELETE'), 0, 'boleto has no delete policy');
SELECT ok(NOT has_table_privilege('authenticated', 'public.contract_documents', 'UPDATE'), 'documents have no update grant');
SELECT ok(NOT has_table_privilege('authenticated', 'public.organization_members', 'UPDATE'), 'members cannot self-authorize');
SELECT is((SELECT count(*)::integer FROM pg_catalog.pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname ILIKE 'Boleto storage%'), 3, 'boleto has select insert and update storage policies');
SELECT is((SELECT count(*)::integer FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'billing_delivery_events'), 2, 'events have only select and insert policies');
SELECT is((SELECT count(*)::integer FROM pg_catalog.pg_trigger WHERE tgrelid = 'public.payments'::regclass AND NOT tgisinternal AND tgname ILIKE '%content_revision%'), 0, 'payments do not bump invoice revision');

-- Behavioral fixtures are intentionally real rows under a transaction. Storage API
-- upload/upsert behavior is covered by boleto-documents.storage.integration.test.ts;
-- this suite never treats direct writes to storage.objects as upload evidence.
INSERT INTO auth.users (id) VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333333'),
  ('44444444-4444-4444-8444-444444444444');

INSERT INTO public.organizations (id, name, slug) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Tenant A', 'boleto-test-a'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'Tenant B', 'boleto-test-b');

INSERT INTO public.organization_members (
  organization_id, user_id, role, can_manage_billing
) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 'admin', false),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '22222222-2222-4222-8222-222222222222', 'member', true),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '33333333-3333-4333-8333-333333333333', 'member', false),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '44444444-4444-4444-8444-444444444444', 'member', true);

INSERT INTO public.customers (
  id, organization_id, legal_name, trade_name, tax_id, state_registration
) VALUES
  ('caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Cliente A', 'Cliente A', '11111111000111', 'IE-A'),
  ('cbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'Cliente B', 'Cliente B', '22222222000122', 'IE-B');

INSERT INTO public.customer_sites (
  id, organization_id, customer_id, name, address_line, number,
  district, city, state, postal_code
) VALUES
  ('daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Obra A', 'Rua A', '1', 'Centro', 'Campinas', 'SP', '13000-000'),
  ('dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'cbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'Obra B', 'Rua B', '2', 'Centro', 'Sorocaba', 'SP', '18000-000');

INSERT INTO public.contracts (
  id, organization_id, internal_number, kind, contract_company, customer_id,
  site_id, start_date, recurrence_days, pricing_model, base_amount, status
) VALUES
  ('eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 101, 'rental', 'fontes', 'caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '2026-08-01', 30, 'fixed', 10000, 'active'),
  ('eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 102, 'rental', 'radial', 'caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '2026-08-01', 30, 'fixed', 20000, 'active'),
  ('ebbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 201, 'rental', 'fontes', 'cbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '2026-08-01', 30, 'fixed', 10000, 'active');

INSERT INTO public.billing_cycles (
  id, organization_id, contract_id, sequence_number, period_start, period_end,
  issue_date, due_date, base_amount, discount_amount, surcharge_amount,
  exemption_amount, total_amount, document_type, document_number, status, notes
) VALUES
  ('faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 1, '2026-08-01', '2026-08-31', '2026-08-01', '2026-08-31', 10000, 0, 0, 0, 10000, 'receipt', 'A-1', 'issued', NULL),
  ('faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 1, '2026-08-01', '2026-08-31', '2026-08-01', '2026-08-31', 20000, 0, 0, 0, 20000, 'receipt', 'A-2', 'issued', NULL),
  ('fbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'ebbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 1, '2026-08-01', '2026-08-31', '2026-08-01', '2026-08-31', 10000, 0, 0, 0, 10000, 'receipt', 'B-1', 'issued', NULL);

INSERT INTO public.contract_documents (
  id, organization_id, contract_id, billing_cycle_id, payment_id, inspection_id,
  kind, storage_path, file_name, content_type, created_by
) VALUES (
  'baaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
  'ebbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
  'fbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', NULL, NULL, 'boleto',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2/ebbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2/boleto/fbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2.pdf',
  'fbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2.pdf', 'application/pdf',
  '44444444-4444-4444-8444-444444444444'
);

INSERT INTO public.billing_delivery_events (
  id, organization_id, billing_cycle_id, sent_at, recipients,
  provider_message_id, send_request_id, created_by
) VALUES (
  'be000000-0000-4000-8000-000000000002',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
  'fbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', now(), ARRAY['tenant-b@example.test'],
  'provider-tenant-b', '91000000-0000-4000-8000-000000000002',
  '44444444-4444-4444-8444-444444444444'
);

-- Admin can create the tenant-A boleto, while tenant and composite-FK checks remain active.
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok($sql$
  INSERT INTO public.contract_documents (
    id, organization_id, contract_id, billing_cycle_id, payment_id, inspection_id,
    kind, storage_path, file_name, content_type, created_by
  ) VALUES (
    'baaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', NULL, NULL, 'boleto',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/boleto/faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1.pdf',
    'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1.pdf', 'application/pdf',
    '11111111-1111-4111-8111-111111111111'
  )
$sql$, 'admin inserts one valid boleto metadata row');

SELECT throws_ok($sql$
  INSERT INTO public.contract_documents (
    organization_id, contract_id, billing_cycle_id, kind, storage_path,
    file_name, content_type, created_by
  ) VALUES (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'boleto',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/boleto/faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2.pdf',
    'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2.pdf', 'application/pdf',
    '11111111-1111-4111-8111-111111111111'
  )
$sql$, '23503', 'insert or update on table "contract_documents" violates foreign key constraint "contract_documents_billing_cycle_contract_org_fkey"', 'composite FK rejects a cycle from another contract');

SELECT throws_ok($sql$
  INSERT INTO public.contract_documents (
    organization_id, contract_id, billing_cycle_id, kind, storage_path,
    file_name, content_type, created_by
  ) VALUES (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'boleto',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/boleto/faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1.pdf',
    'duplicate.pdf', 'application/pdf',
    '11111111-1111-4111-8111-111111111111'
  )
$sql$, '23505', 'duplicate key value violates unique constraint "contract_documents_one_boleto_per_billing_uidx"', 'unique partial index rejects a second boleto per cycle');

RESET ROLE;

-- Common member sees no restricted metadata/events and cannot self-authorize or write boleto.
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT is((SELECT count(*)::integer FROM public.contract_documents WHERE kind = 'boleto'), 0, 'common member sees no boleto metadata');
SELECT is((SELECT count(*)::integer FROM public.billing_delivery_events), 0, 'common member sees no delivery event');
SELECT throws_ok($sql$
  UPDATE public.organization_members SET can_manage_billing = true
  WHERE organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    AND user_id = '33333333-3333-4333-8333-333333333333'
$sql$, '42501', 'permission denied for table organization_members', 'common member cannot self-authorize');
SELECT throws_ok($sql$
  INSERT INTO public.contract_documents (
    organization_id, contract_id, billing_cycle_id, kind, storage_path,
    file_name, content_type, created_by
  ) VALUES (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'boleto',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2/boleto/faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2.pdf',
    'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2.pdf', 'application/pdf',
    '33333333-3333-4333-8333-333333333333'
  )
$sql$, '42501', 'new row violates row-level security policy for table "contract_documents"', 'common member cannot insert boleto metadata');
SELECT throws_ok($sql$
  SELECT * FROM public.begin_boleto_change(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '90000000-0000-4000-8000-000000000004'
  )
$sql$, '42501', 'billing capability required', 'common member cannot begin boleto change');

RESET ROLE;

-- Finance is tenant-scoped, can use begin, and cannot mutate immutable history.
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT is((SELECT count(*)::integer FROM public.contract_documents WHERE kind = 'boleto'), 1, 'finance sees only tenant-A boleto');
SELECT is((SELECT count(*)::integer FROM public.billing_delivery_events), 0, 'finance cannot see tenant-B delivery event');
SELECT lives_ok($sql$
  INSERT INTO public.billing_delivery_events (
    organization_id, billing_cycle_id, sent_at, recipients,
    provider_message_id, send_request_id, created_by
  ) VALUES (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', now(), ARRAY['tenant-a@example.test'],
    'provider-tenant-a', '91000000-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222'
  )
$sql$, 'finance inserts an immutable tenant-A delivery event');
SELECT is((SELECT count(*)::integer FROM public.billing_delivery_events), 1, 'finance sees only its tenant delivery history');
SELECT lives_ok($sql$
  SELECT * FROM public.begin_boleto_change(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    '90000000-0000-4000-8000-000000000001'
  )
$sql$, 'finance can begin boleto change');
SELECT lives_ok($sql$
  SELECT * FROM public.begin_boleto_change(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    '90000000-0000-4000-8000-000000000001'
  )
$sql$, 'same begin UUID is idempotent');
SELECT throws_ok($sql$
  SELECT * FROM public.begin_boleto_change(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    '90000000-0000-4000-8000-000000000002'
  )
$sql$, '55P03', 'another boleto change is pending', 'different begin UUID conflicts while pending');
SELECT throws_ok($sql$
  SELECT * FROM public.begin_boleto_change(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    'ebbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    'fbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    '90000000-0000-4000-8000-000000000003'
  )
$sql$, '42501', 'billing capability required', 'finance cannot begin in tenant B');
SELECT throws_ok('UPDATE public.billing_delivery_events SET additional_message = ''changed''', '42501', 'permission denied for table billing_delivery_events', 'delivery events cannot be updated');
SELECT throws_ok('DELETE FROM public.billing_delivery_events', '42501', 'permission denied for table billing_delivery_events', 'delivery events cannot be deleted');

RESET ROLE;
UPDATE public.billing_cycles
SET boleto_change_pending = false, boleto_change_started_at = NULL
WHERE id = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';

-- Revision/latch behavior: rendered sources bump atomically; irrelevant status/payment do not.
UPDATE public.billing_cycles
SET sent_at = '2026-08-20T12:00:00Z', content_revision = 0, needs_resend = false
WHERE id = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

UPDATE public.billing_cycles SET notes = 'rendered note' WHERE id = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
SELECT is((SELECT content_revision FROM public.billing_cycles WHERE id = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), 1::bigint, 'rendered cycle update bumps revision');
SELECT is((SELECT needs_resend FROM public.billing_cycles WHERE id = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), true, 'rendered cycle update latches resend');
UPDATE public.billing_cycles SET status = 'overdue' WHERE id = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
SELECT is((SELECT content_revision FROM public.billing_cycles WHERE id = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), 1::bigint, 'status-only update does not bump');
SELECT throws_ok(
  'UPDATE public.billing_cycles SET needs_resend = false WHERE id = ''faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1''',
  '42501', 'needs_resend cannot be cleared by API roles', 'API role cannot clear needs_resend latch'
);

INSERT INTO public.billing_lines (
  id, organization_id, billing_cycle_id, description, quantity, unit_amount, total_amount, kind
) VALUES (
  'a1000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Linha renderizada', 1, 10000, 10000, 'recurring'
);
SELECT is((SELECT content_revision FROM public.billing_cycles WHERE id = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), 2::bigint, 'rendered line insert bumps revision');

SAVEPOINT immutable_billing_line_id;
SELECT throws_ok(
  'UPDATE public.billing_lines SET id = ''a1000000-0000-4000-8000-000000000099'' WHERE id = ''a1000000-0000-4000-8000-000000000001''',
  '42501', 'permission denied for table billing_lines', 'authenticated cannot change billing line id'
);
ROLLBACK TO SAVEPOINT immutable_billing_line_id;
RELEASE SAVEPOINT immutable_billing_line_id;

SAVEPOINT immutable_billing_line_created_at;
SELECT throws_ok(
  'UPDATE public.billing_lines SET created_at = now() - interval ''1 day'' WHERE id = ''a1000000-0000-4000-8000-000000000001''',
  '42501', 'permission denied for table billing_lines', 'authenticated cannot change billing line created_at'
);
ROLLBACK TO SAVEPOINT immutable_billing_line_created_at;
RELEASE SAVEPOINT immutable_billing_line_created_at;

SAVEPOINT editable_billing_line_content;
UPDATE public.billing_lines
SET description = 'Linha renderizada alterada'
WHERE id = 'a1000000-0000-4000-8000-000000000001';
SELECT is((SELECT content_revision FROM public.billing_cycles WHERE id = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), 3::bigint, 'legitimate line content update bumps revision');
SELECT is((SELECT needs_resend FROM public.billing_cycles WHERE id = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), true, 'legitimate line content update keeps resend latched');
ROLLBACK TO SAVEPOINT editable_billing_line_content;
RELEASE SAVEPOINT editable_billing_line_content;

INSERT INTO public.billing_lines (
  id, organization_id, billing_cycle_id, description, quantity, unit_amount, total_amount, kind
) VALUES (
  'a1000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Desconto não renderizado', 1, 100, 100, 'discount'
);
SELECT is((SELECT content_revision FROM public.billing_cycles WHERE id = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), 2::bigint, 'isolated discount line does not bump');

UPDATE public.billing_lines
SET billing_cycle_id = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
WHERE id = 'a1000000-0000-4000-8000-000000000001';
SELECT is((SELECT content_revision FROM public.billing_cycles WHERE id = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), 3::bigint, 'line movement bumps source cycle');
SELECT is((SELECT content_revision FROM public.billing_cycles WHERE id = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'), 1::bigint, 'line movement bumps destination cycle');

UPDATE public.contracts SET notes = 'rendered contract note' WHERE id = 'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
SELECT is((SELECT content_revision FROM public.billing_cycles WHERE id = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), 4::bigint, 'rendered contract update fans out');
UPDATE public.customers SET trade_name = 'Cliente A alterado' WHERE id = 'caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
SELECT is((SELECT content_revision FROM public.billing_cycles WHERE id = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), 5::bigint, 'rendered customer update fans out');
UPDATE public.customer_sites SET city = 'Valinhos' WHERE id = 'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
SELECT is((SELECT content_revision FROM public.billing_cycles WHERE id = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), 6::bigint, 'rendered site update fans out');

INSERT INTO public.payments (organization_id, billing_cycle_id, paid_at, amount, notes)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', now(), 100, 'payment is not rendered');
SELECT is((SELECT content_revision FROM public.billing_cycles WHERE id = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), 6::bigint, 'payment does not bump revision');

SAVEPOINT rendered_source_rollback;
UPDATE public.billing_cycles SET notes = 'rolled back' WHERE id = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
SELECT is((SELECT content_revision FROM public.billing_cycles WHERE id = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), 7::bigint, 'source and bump are visible in one transaction');
ROLLBACK TO SAVEPOINT rendered_source_rollback;
SELECT is((SELECT notes FROM public.billing_cycles WHERE id = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), 'rendered note', 'source rollback restores source');
SELECT is((SELECT content_revision FROM public.billing_cycles WHERE id = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), 6::bigint, 'source rollback restores revision');

RESET ROLE;

-- Anon receives no rows through RLS.
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
SELECT throws_ok('SELECT * FROM public.billing_delivery_events', '42501', 'permission denied for table billing_delivery_events', 'anon cannot select delivery events');
SELECT throws_ok('SELECT * FROM public.contract_documents WHERE kind = ''boleto''', '42501', 'permission denied for table contract_documents', 'anon cannot select boleto metadata');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
