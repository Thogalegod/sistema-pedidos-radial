BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT ok(
  (SELECT prosecdef FROM pg_catalog.pg_proc
   WHERE oid = 'public.finalize_billing_delivery(uuid,uuid,timestamptz,text[],text,uuid,text,bigint)'::regprocedure),
  'finalization is security definer'
);
SELECT ok(
  (SELECT proconfig @> ARRAY['search_path=""'] FROM pg_catalog.pg_proc
   WHERE oid = 'public.finalize_billing_delivery(uuid,uuid,timestamptz,text[],text,uuid,text,bigint)'::regprocedure),
  'finalization has empty search_path'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.finalize_billing_delivery(uuid,uuid,timestamptz,text[],text,uuid,text,bigint)',
    'EXECUTE'
  ),
  'authenticated can execute finalization'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.finalize_billing_delivery(uuid,uuid,timestamptz,text[],text,uuid,text,bigint)',
    'EXECUTE'
  ),
  'anon cannot execute finalization'
);

INSERT INTO auth.users (id) VALUES
  ('51111111-1111-4111-8111-111111111111'),
  ('52222222-2222-4222-8222-222222222222'),
  ('53333333-3333-4333-8333-333333333333'),
  ('54444444-4444-4444-8444-444444444444');

INSERT INTO public.organizations (id, name, slug) VALUES
  ('5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Delivery Tenant A', 'delivery-test-a'),
  ('5bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'Delivery Tenant B', 'delivery-test-b');

INSERT INTO public.organization_members (organization_id, user_id, role, can_manage_billing) VALUES
  ('5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '51111111-1111-4111-8111-111111111111', 'admin', false),
  ('5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '52222222-2222-4222-8222-222222222222', 'member', true),
  ('5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '53333333-3333-4333-8333-333333333333', 'member', false),
  ('5bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '54444444-4444-4444-8444-444444444444', 'admin', false);

INSERT INTO public.customers (
  id, organization_id, legal_name, trade_name, tax_id, state_registration
) VALUES
  ('5caaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Cliente A', 'Cliente A', '11111111000111', 'IE-A'),
  ('5cbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '5bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'Cliente B', 'Cliente B', '22222222000122', 'IE-B');

INSERT INTO public.customer_sites (
  id, organization_id, customer_id, name, address_line, number,
  district, city, state, postal_code
) VALUES
  ('5daaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '5caaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Obra A', 'Rua A', '1', 'Centro', 'Campinas', 'SP', '13000-000'),
  ('5dbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '5bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '5cbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'Obra B', 'Rua B', '2', 'Centro', 'Sorocaba', 'SP', '18000-000');

INSERT INTO public.contracts (
  id, organization_id, internal_number, kind, contract_company, customer_id,
  site_id, start_date, recurrence_days, pricing_model, base_amount, status
) VALUES
  ('5eaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 501, 'rental', 'fontes', '5caaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '5daaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '2026-08-01', 30, 'fixed', 10000, 'active'),
  ('5ebbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '5bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 502, 'rental', 'radial', '5cbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '5dbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '2026-08-01', 30, 'fixed', 10000, 'active');

INSERT INTO public.billing_cycles (
  id, organization_id, contract_id, sequence_number, period_start, period_end,
  issue_date, due_date, base_amount, discount_amount, surcharge_amount,
  exemption_amount, total_amount, document_type, document_number, status, notes
) VALUES
  ('5faaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '5eaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 1, '2026-08-01', '2026-08-31', '2026-08-01', '2026-08-31', 10000, 0, 0, 0, 10000, 'receipt', 'D-1', 'issued', NULL),
  ('5fbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '5bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '5ebbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 1, '2026-08-01', '2026-08-31', '2026-08-01', '2026-08-31', 10000, 0, 0, 0, 10000, 'receipt', 'D-2', 'issued', NULL);

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($sql$
  SELECT * FROM public.finalize_billing_delivery(
    '5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '5faaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '2026-08-27T12:00:00Z', ARRAY['billing@example.com'], 'provider-no-auth',
    '55000000-0000-4000-8000-000000000001', NULL, 0
  )
$sql$, '42501', 'authentication required', 'missing authenticated user is rejected');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '53333333-3333-4333-8333-333333333333', true);
SELECT set_config('request.jwt.claims', '{"sub":"53333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($sql$
  SELECT * FROM public.finalize_billing_delivery(
    '5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '5faaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '2026-08-27T12:00:00Z', ARRAY['billing@example.com'], 'provider-member',
    '55000000-0000-4000-8000-000000000002', NULL, 0
  )
$sql$, '42501', 'billing capability required', 'common member is rejected');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '52222222-2222-4222-8222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"52222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($sql$
  SELECT * FROM public.finalize_billing_delivery(
    '5bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '5fbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    '2026-08-27T12:00:00Z', ARRAY['billing@example.com'], 'provider-cross-tenant',
    '55000000-0000-4000-8000-000000000003', NULL, 0
  )
$sql$, '42501', 'billing capability required', 'finance cannot finalize another tenant');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '51111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"51111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT inserted_event FROM public.finalize_billing_delivery(
    '5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '5faaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '2026-08-27T12:00:00Z', ARRAY['billing@example.com'], 'provider-stable',
    '55000000-0000-4000-8000-000000000010', 'Mensagem', 0
  )),
  true,
  'stable first finalization inserts one event'
);
SELECT is((SELECT count(*)::integer FROM public.billing_delivery_events WHERE send_request_id = '55000000-0000-4000-8000-000000000010'), 1, 'one event exists');
SELECT is((SELECT created_by FROM public.billing_delivery_events WHERE send_request_id = '55000000-0000-4000-8000-000000000010'), '51111111-1111-4111-8111-111111111111'::uuid, 'event records auth uid');
SELECT is((SELECT needs_resend FROM public.billing_cycles WHERE id = '5faaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), false, 'stable finalization clears latch');
RESET ROLE;

UPDATE public.billing_cycles
SET notes = 'conteúdo alterado depois do envio'
WHERE id = '5faaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

SELECT set_config('request.jwt.claim.sub', '51111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"51111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT inserted_event FROM public.finalize_billing_delivery(
    '5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '5faaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '2026-08-27T11:00:00Z', ARRAY['billing@example.com'], 'provider-stable',
    '55000000-0000-4000-8000-000000000010', 'Mensagem',
    (SELECT content_revision FROM public.billing_cycles WHERE id = '5faaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')
  )),
  false,
  'same request id is reconciled without a new event'
);
SELECT is((SELECT count(*)::integer FROM public.billing_delivery_events WHERE billing_cycle_id = '5faaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), 1, 'replay does not duplicate history');
SELECT is((SELECT needs_resend FROM public.billing_cycles WHERE id = '5faaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), true, 'old replay preserves resend latch after content changed');
SELECT is((SELECT sent_at FROM public.billing_cycles WHERE id = '5faaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), '2026-08-27T12:00:00Z'::timestamptz, 'old replay never regresses sent_at');

SELECT throws_ok($sql$
  SELECT * FROM public.finalize_billing_delivery(
    '5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '5faaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '2026-08-27T12:00:00Z', ARRAY['different@example.com'], 'provider-stable',
    '55000000-0000-4000-8000-000000000010', 'Mensagem', 1
  )
$sql$, '23505', 'billing delivery intent conflict', 'same request id with a different payload conflicts');

SELECT is(
  (SELECT needs_resend FROM public.finalize_billing_delivery(
    '5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '5faaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '2026-08-27T13:00:00Z', ARRAY['billing@example.com'], 'provider-resend',
    '55000000-0000-4000-8000-000000000011', NULL,
    (SELECT content_revision FROM public.billing_cycles WHERE id = '5faaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')
  )),
  false,
  'new deliberate resend clears latch when its own revision is stable'
);
SELECT is((SELECT count(*)::integer FROM public.billing_delivery_events WHERE billing_cycle_id = '5faaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), 2, 'deliberate resend creates a second event');
RESET ROLE;

UPDATE public.billing_cycles
SET boleto_change_pending = true,
    boleto_change_operation_id = '55000000-0000-4000-8000-000000000099',
    boleto_change_started_at = now()
WHERE id = '5faaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

SELECT set_config('request.jwt.claim.sub', '51111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"51111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT review_required FROM public.finalize_billing_delivery(
    '5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '5faaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '2026-08-27T14:00:00Z', ARRAY['billing@example.com'], 'provider-pending',
    '55000000-0000-4000-8000-000000000012', NULL,
    (SELECT content_revision FROM public.billing_cycles WHERE id = '5faaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')
  )),
  true,
  'pending boleto preserves provider success but requires review'
);
SELECT is((SELECT needs_resend FROM public.billing_cycles WHERE id = '5faaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), true, 'pending boleto forces resend latch');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
