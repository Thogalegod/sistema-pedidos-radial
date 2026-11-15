-- READ-ONLY. Run only after separately authorized M08 application in IURQ.
-- Aggregates and object metadata only; no names, emails or business text.
SELECT singleton,status_mode,timeline_mode FROM private.pedidos_v1_rollout;

SELECT count(*) AS tarefas_total,
  count(*) FILTER (WHERE pedido_id IS NULL AND frente_id IS NULL) AS tarefas_avulsas,
  count(*) FILTER (WHERE pedido_id IS NOT NULL AND frente_id IS NOT NULL) AS tarefas_pedido,
  count(*) FILTER (WHERE (pedido_id IS NULL) IS DISTINCT FROM (frente_id IS NULL)) AS pares_inconsistentes,
  count(*) FILTER (WHERE pedido_id IS NULL AND responsavel_user_id IS NULL) AS avulsas_sem_responsavel
FROM public.tarefas;

SELECT count(*) AS arestas_com_avulsa
FROM public.tarefa_dependencias d
JOIN public.tarefas t
  ON t.organization_id=d.organization_id AND t.id=d.tarefa_id
JOIN public.tarefas p
  ON p.organization_id=d.organization_id AND p.id=d.predecessora_id
WHERE t.pedido_id IS NULL OR p.pedido_id IS NULL;

SELECT count(*) AS eventos_avulsos,
  count(*) FILTER (WHERE c.event_type IS NULL) AS notas_humanas_avulsas
FROM public.comentarios_tarefa c
JOIN public.tarefas t ON t.organization_id=c.organization_id AND t.id=c.tarefa_id
WHERE t.pedido_id IS NULL;

SELECT conname,contype,convalidated,pg_get_constraintdef(oid) AS definicao
FROM pg_constraint
WHERE conrelid='public.tarefas'::regclass
  AND conname IN('tarefas_pedido_front_pair_check','tarefas_frente_org_pedido_fkey',
    'tarefas_responsavel_member_fkey')
ORDER BY conname;

SELECT attname,attnotnull
FROM pg_attribute
WHERE attrelid IN('public.tarefas'::regclass,'public.comentarios_tarefa'::regclass)
  AND attname IN('pedido_id','frente_id','event_type') AND NOT attisdropped
ORDER BY attrelid::regclass::text,attname;

SELECT has_table_privilege('authenticated','public.tarefas','SELECT') AS tarefa_select,
  has_table_privilege('authenticated','public.tarefas','INSERT') AS tarefa_insert_direto,
  has_table_privilege('authenticated','public.tarefas','UPDATE') AS tarefa_update_direto,
  has_table_privilege('authenticated','public.tarefas','DELETE') AS tarefa_delete_direto,
  has_function_privilege('authenticated',
    'private.protect_pedido_task_note_event()'::regprocedure,'EXECUTE') AS guard_evento_executavel;
