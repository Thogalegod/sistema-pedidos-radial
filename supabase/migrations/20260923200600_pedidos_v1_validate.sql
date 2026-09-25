-- M07 / 1D. Validate the M02 membership FK and close legacy write shapes.
-- No historical columns or rows are removed. M08 will relax the Pedido/Frente
-- requirement together when standalone tasks become available.
BEGIN;
SET LOCAL lock_timeout='5s';

LOCK TABLE private.pedidos_v1_rollout,public.pedidos,public.pedido_frentes,
  public.tarefas,public.organization_members IN ACCESS EXCLUSIVE MODE NOWAIT;

DO $$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM private.pedidos_v1_rollout
    WHERE singleton AND status_mode='v1' AND timeline_mode='legacy'
  ) THEN
    RAISE EXCEPTION 'M07 requires v1/legacy rollout mode' USING ERRCODE='55000';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='public.tarefas'::regclass
      AND conname='tarefas_responsavel_member_fkey'
      AND contype='f' AND NOT convalidated
  ) THEN
    RAISE EXCEPTION 'Expected unvalidated assignee membership FK is missing'
      USING ERRCODE='55000';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.pedidos
    WHERE status NOT IN('Em andamento','Finalizado','Cancelado')
  ) OR EXISTS(
    SELECT 1 FROM public.tarefas t
    LEFT JOIN public.pedido_frentes f
      ON f.organization_id=t.organization_id AND f.pedido_id=t.pedido_id AND f.id=t.frente_id
    LEFT JOIN public.organization_members m
      ON m.organization_id=t.organization_id AND m.user_id=t.responsavel_user_id
    WHERE t.pedido_id IS NULL OR t.frente_id IS NULL OR f.id IS NULL
      OR t.status IS NULL OR t.prioridade IS NULL
      OR (t.responsavel_user_id IS NOT NULL AND m.user_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'M07 data inventory found an invalid Pedido/task; review before restriction'
      USING ERRCODE='23514';
  END IF;
END;
$$;

ALTER TABLE public.tarefas VALIDATE CONSTRAINT tarefas_responsavel_member_fkey;
ALTER TABLE public.tarefas
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN prioridade SET NOT NULL;
ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_pedido_front_required_check
  CHECK (frente_id IS NOT NULL);

ALTER TABLE public.pedidos DROP CONSTRAINT pedidos_status_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_status_check
  CHECK (status IN ('Em andamento','Finalizado','Cancelado'));
COMMIT;
