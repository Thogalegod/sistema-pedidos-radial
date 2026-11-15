-- Read-only M15 verification. Every invalid_* count must be zero.
SELECT count(*) AS total_events,
  count(*) FILTER (WHERE pedido_id IS NULL AND tarefa_id IS NULL) AS standalone_events,
  count(*) FILTER (WHERE data IS NULL OR horario IS NULL OR horario >= TIME '24:00:00') AS invalid_civil_datetime,
  count(*) FILTER (WHERE tipo NOT IN ('meeting','visit','external_service','other')) AS invalid_kind
FROM public.pedido_eventos;

SELECT count(*) FILTER (WHERE m.user_id IS NULL) AS invalid_assignee,
  count(*) FILTER (WHERE e.tarefa_id IS NOT NULL AND (t.id IS NULL
    OR e.pedido_id IS DISTINCT FROM t.pedido_id OR e.frente_id IS DISTINCT FROM t.frente_id)) AS invalid_task_context,
  count(*) FILTER (WHERE e.frente_id IS NOT NULL AND (e.pedido_id IS NULL OR f.id IS NULL)) AS invalid_front_context,
  count(*) FILTER (WHERE e.pedido_id IS NOT NULL AND p.id IS NULL) AS invalid_order_context,
  count(*) FILTER (WHERE e.customer_id IS NOT NULL AND c.id IS NULL) AS invalid_customer_context,
  count(*) FILTER (WHERE p.customer_id IS NOT NULL AND e.customer_id IS NOT NULL
    AND p.customer_id IS DISTINCT FROM e.customer_id) AS invalid_order_customer
FROM public.pedido_eventos e
LEFT JOIN public.organization_members m ON m.organization_id=e.organization_id
  AND m.user_id=e.responsavel_user_id
LEFT JOIN public.tarefas t ON t.organization_id=e.organization_id AND t.id=e.tarefa_id
LEFT JOIN public.pedidos p ON p.organization_id=e.organization_id AND p.id=e.pedido_id
LEFT JOIN public.pedido_frentes f ON f.organization_id=e.organization_id
  AND f.pedido_id=e.pedido_id AND f.id=e.frente_id
LEFT JOIN public.customers c ON c.organization_id=e.organization_id AND c.id=e.customer_id;

SELECT has_table_privilege('authenticated','public.pedido_eventos','SELECT') AS authenticated_can_read,
  has_table_privilege('authenticated','public.pedido_eventos','INSERT') AS authenticated_can_insert,
  has_table_privilege('authenticated','public.pedido_eventos','UPDATE') AS authenticated_can_update,
  has_table_privilege('authenticated','public.pedido_eventos','DELETE') AS authenticated_can_delete,
  has_table_privilege('authenticated','public.pedido_eventos','TRUNCATE') AS authenticated_can_truncate,
  has_table_privilege('anon','public.pedido_eventos','SELECT') AS anon_can_read;
