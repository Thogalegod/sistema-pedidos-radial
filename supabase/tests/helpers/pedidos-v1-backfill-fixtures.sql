-- Local disposable DB only, after base fixtures and inside BEGIN/ROLLBACK.
-- Recreate historical rows without allowing expansion triggers to invent data.
ALTER TABLE public.tarefas DISABLE TRIGGER tarefas_assign_legacy_front;
ALTER TABLE public.tarefas DISABLE TRIGGER tarefas_sync_legacy_state;
ALTER TABLE public.tarefas DISABLE TRIGGER tarefas_z_stamp_update;
UPDATE public.tarefas SET frente_id=NULL,status=NULL,updated_at=NULL,
  responsavel='Nome QA correspondente',vencimento='2026-09-20';
DELETE FROM public.pedido_frentes;
UPDATE public.organization_members SET display_name='Nome QA correspondente'
  WHERE user_id='05000000-0000-4000-8000-000000000002';
UPDATE public.pedidos SET status='Aguardando Cliente' WHERE id='05000002-0000-4000-8000-000000000002';
UPDATE public.pedidos SET status='Concluído' WHERE id='05000002-0000-4000-8000-000000000003';
INSERT INTO public.pedidos(id,organization_id,numero_pedido,projeto,cliente,endereco,prioridade,status)
SELECT id::uuid,'05000001-0000-4000-8000-000000000001',label,label,'QA','QA','Alta',status
FROM(VALUES
 ('05000002-0000-4000-8000-000000000004','QA utility','Prazo Concessionária'),
 ('05000002-0000-4000-8000-000000000005','QA active','Em andamento'),
 ('05000002-0000-4000-8000-000000000006','QA final','Finalizado'),
 ('05000002-0000-4000-8000-000000000007','QA cancelled','Cancelado')
)q(id,label,status);
INSERT INTO public.pedido_frentes(id,organization_id,pedido_id,nome,ordem)
VALUES('05000007-0000-4000-8000-000000000001','05000001-0000-4000-8000-000000000001',
 '05000002-0000-4000-8000-000000000001','Frente existente QA',1);
INSERT INTO public.tarefas(id,organization_id,pedido_id,descricao,responsavel,concluido,concluida_em,vencimento)
VALUES
 ('05000003-0000-4000-8000-000000000004','05000001-0000-4000-8000-000000000001','05000002-0000-4000-8000-000000000001','QA completed','Texto QA 3',true,'2026-09-19T12:00:00Z','2026-09-18'),
 ('05000003-0000-4000-8000-000000000005','05000001-0000-4000-8000-000000000001','05000002-0000-4000-8000-000000000001','QA open','Texto QA 4',false,NULL,NULL);
INSERT INTO public.tarefas(id,organization_id,pedido_id,descricao,responsavel,responsavel_user_id,frente_id,updated_at)
VALUES('05000003-0000-4000-8000-000000000006','05000001-0000-4000-8000-000000000001','05000002-0000-4000-8000-000000000001','QA already assigned','Texto preservado',
 '05000000-0000-4000-8000-000000000002','05000007-0000-4000-8000-000000000001','2026-09-19T12:00:00Z');
ALTER TABLE public.tarefas ENABLE TRIGGER tarefas_assign_legacy_front;
ALTER TABLE public.tarefas ENABLE TRIGGER tarefas_sync_legacy_state;
ALTER TABLE public.tarefas ENABLE TRIGGER tarefas_z_stamp_update;
INSERT INTO public.subtarefas(organization_id,tarefa_id,descricao,concluida)
VALUES('05000001-0000-4000-8000-000000000001',NULL,'QA historic unattached subtask',NULL);
INSERT INTO public.comentarios_tarefa(organization_id,tarefa_id,texto,usuario)
VALUES('05000001-0000-4000-8000-000000000001',NULL,'QA historic unattached note','QA');
