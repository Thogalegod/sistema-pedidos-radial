-- Include after pedidos-v1-fixtures.sql, inside the caller's transaction.
-- Two extra tasks in A1 and one in A2; no changes to shared fixture counts.
SELECT set_config('request.jwt.claim.sub','05000000-0000-4000-8000-000000000002',true);
INSERT INTO public.tarefas(id,organization_id,pedido_id,descricao) VALUES
 ('05000003-0000-4000-8000-000000000004','05000001-0000-4000-8000-000000000001','05000002-0000-4000-8000-000000000001','QA dependency C'),
 ('05000003-0000-4000-8000-000000000005','05000001-0000-4000-8000-000000000001','05000002-0000-4000-8000-000000000001','QA dependency D'),
 ('05000003-0000-4000-8000-000000000006','05000001-0000-4000-8000-000000000001','05000002-0000-4000-8000-000000000002','QA other order');
SELECT set_config('request.jwt.claim.sub','',true);
