-- READ-ONLY. Run only after separately authorized M07 application in IURQ.
-- Aggregates and object metadata only; no names, emails or business text.
SELECT singleton,status_mode,timeline_mode FROM private.pedidos_v1_rollout;

SELECT (SELECT count(*) FROM public.pedidos) AS pedidos,
  (SELECT count(*) FROM public.pedido_frentes) AS frentes,
  (SELECT count(*) FROM public.tarefas) AS tarefas,
  (SELECT count(*) FROM public.subtarefas) AS subtarefas,
  (SELECT count(*) FROM public.comentarios_tarefa) AS notas_legadas,
  (SELECT count(*) FROM public.atividades) AS atividades,
  (SELECT count(*) FROM public.anexos) AS anexos;

SELECT (SELECT count(*) FROM public.pedidos
    WHERE status NOT IN('Em andamento','Finalizado','Cancelado')) AS pedido_status_invalidos,
  (SELECT count(*) FROM public.tarefas
    WHERE pedido_id IS NULL OR frente_id IS NULL OR status IS NULL OR prioridade IS NULL) AS tarefa_obrigatorios_ausentes,
  (SELECT count(*) FROM public.tarefas t LEFT JOIN public.pedido_frentes f
    ON f.organization_id=t.organization_id AND f.pedido_id=t.pedido_id AND f.id=t.frente_id
    WHERE f.id IS NULL) AS tarefa_frente_invalida,
  (SELECT count(*) FROM public.tarefas t LEFT JOIN public.organization_members m
    ON m.organization_id=t.organization_id AND m.user_id=t.responsavel_user_id
    WHERE t.responsavel_user_id IS NOT NULL AND m.user_id IS NULL) AS responsavel_invalido,
  (SELECT count(*) FROM public.tarefas t LEFT JOIN public.organization_members m
    ON m.organization_id=t.organization_id AND m.user_id=t.waiting_user_id
    WHERE t.waiting_user_id IS NOT NULL AND m.user_id IS NULL) AS espera_interna_invalida,
  (SELECT count(*) FROM public.tarefas
    WHERE concluido IS DISTINCT FROM (status='Concluída')
      OR (status='Concluída' AND concluida_em IS NULL)
      OR (status<>'Concluída' AND concluida_em IS NOT NULL)) AS projecao_invalida;

SELECT conrelid::regclass::text AS tabela,conname,contype,convalidated,
  pg_get_constraintdef(oid) AS definicao
FROM pg_constraint
WHERE conrelid IN('public.tarefas'::regclass,'public.pedido_frentes'::regclass,'public.pedidos'::regclass)
  AND conname IN('tarefas_responsavel_member_fkey','tarefas_frente_org_pedido_fkey',
    'tarefas_pedido_front_required_check','pedidos_status_check')
ORDER BY tabela,conname;

SELECT attname,attnotnull FROM pg_attribute
WHERE attrelid='public.tarefas'::regclass
  AND attname IN('pedido_id','frente_id','status','prioridade','responsavel','concluido','prazo')
  AND NOT attisdropped ORDER BY attname;

SELECT has_schema_privilege('authenticated','private','USAGE') AS authenticated_private_usage,
  has_schema_privilege('anon','private','USAGE') AS anon_private_usage,
  has_table_privilege('authenticated','private.pedidos_v1_rollout','SELECT') AS authenticated_rollout_select,
  has_function_privilege('authenticated',
    'private.ensure_pedido_default_front(uuid,uuid)'::regprocedure,'EXECUTE') AS authenticated_front_helper_execute,
  has_function_privilege('authenticated',
    'private.sync_pedido_task_canonical_state()'::regprocedure,'EXECUTE') AS authenticated_status_helper_execute,
  has_table_privilege('authenticated','public.tarefas','SELECT') AS tarefa_select,
  has_table_privilege('authenticated','public.tarefas','INSERT') AS tarefa_insert_direto,
  has_table_privilege('authenticated','public.tarefas','UPDATE') AS tarefa_update_direto,
  has_table_privilege('authenticated','public.tarefas','DELETE') AS tarefa_delete_direto;
