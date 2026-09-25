-- Synthetic identities only. Include inside the caller's BEGIN/ROLLBACK.
-- A has an admin (001) and a common member (002); B has a common member (003).
INSERT INTO auth.users (id) VALUES
  ('05000000-0000-4000-8000-000000000001'),
  ('05000000-0000-4000-8000-000000000002'),
  ('05000000-0000-4000-8000-000000000003');

INSERT INTO public.organizations (id, name, slug) VALUES
  ('05000001-0000-4000-8000-000000000001', 'Pedidos test A', 'pedidos-v1-test-a'),
  ('05000001-0000-4000-8000-000000000002', 'Pedidos test B', 'pedidos-v1-test-b');

INSERT INTO public.organization_members (organization_id, user_id, role) VALUES
  ('05000001-0000-4000-8000-000000000001', '05000000-0000-4000-8000-000000000001', 'admin'),
  ('05000001-0000-4000-8000-000000000001', '05000000-0000-4000-8000-000000000002', 'member'),
  ('05000001-0000-4000-8000-000000000002', '05000000-0000-4000-8000-000000000003', 'member');

INSERT INTO public.pedidos
  (id, organization_id, numero_pedido, projeto, cliente, endereco, prioridade, status)
VALUES
  ('05000002-0000-4000-8000-000000000001', '05000001-0000-4000-8000-000000000001', 'QA-A1', 'QA A1', 'QA A', 'QA A', 'Normal', 'Ação Pendente'),
  ('05000002-0000-4000-8000-000000000002', '05000001-0000-4000-8000-000000000001', 'QA-A2', 'QA A2', 'QA A', 'QA A', 'Normal', 'Ação Pendente'),
  ('05000002-0000-4000-8000-000000000003', '05000001-0000-4000-8000-000000000002', 'QA-B1', 'QA B1', 'QA B', 'QA B', 'Normal', 'Ação Pendente');

-- Authenticated claims also exercise the legacy INSERT trigger after M01.
SELECT set_config('request.jwt.claim.sub','05000000-0000-4000-8000-000000000002',true);
INSERT INTO public.tarefas (id, organization_id, pedido_id, descricao) VALUES
  ('05000003-0000-4000-8000-000000000001', '05000001-0000-4000-8000-000000000001', '05000002-0000-4000-8000-000000000001', 'QA A');
SELECT set_config('request.jwt.claim.sub','05000000-0000-4000-8000-000000000003',true);
INSERT INTO public.tarefas (id, organization_id, pedido_id, descricao) VALUES
  ('05000003-0000-4000-8000-000000000003', '05000001-0000-4000-8000-000000000002', '05000002-0000-4000-8000-000000000003', 'QA B');
SELECT set_config('request.jwt.claim.sub','',true);

INSERT INTO public.subtarefas (organization_id, tarefa_id, descricao) VALUES
  ('05000001-0000-4000-8000-000000000001', '05000003-0000-4000-8000-000000000001', 'QA A'),
  ('05000001-0000-4000-8000-000000000002', '05000003-0000-4000-8000-000000000003', 'QA B');
INSERT INTO public.comentarios_tarefa (organization_id, tarefa_id, texto, usuario) VALUES
  ('05000001-0000-4000-8000-000000000001', '05000003-0000-4000-8000-000000000001', 'QA A', 'QA'),
  ('05000001-0000-4000-8000-000000000002', '05000003-0000-4000-8000-000000000003', 'QA B', 'QA');
INSERT INTO public.atividades (organization_id, pedido_id, descricao, usuario) VALUES
  ('05000001-0000-4000-8000-000000000001', '05000002-0000-4000-8000-000000000001', 'QA A', 'QA'),
  ('05000001-0000-4000-8000-000000000002', '05000002-0000-4000-8000-000000000003', 'QA B', 'QA');
INSERT INTO public.anexos (organization_id, pedido_id, nome_arquivo, tipo, storage_path) VALUES
  ('05000001-0000-4000-8000-000000000001', '05000002-0000-4000-8000-000000000001', 'qa-a.pdf', 'application/pdf', '05000001-0000-4000-8000-000000000001/05000002-0000-4000-8000-000000000001/qa-a.pdf'),
  ('05000001-0000-4000-8000-000000000002', '05000002-0000-4000-8000-000000000003', 'qa-b.pdf', 'application/pdf', '05000001-0000-4000-8000-000000000002/05000002-0000-4000-8000-000000000003/qa-b.pdf');
