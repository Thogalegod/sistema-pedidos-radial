-- M06 / 1C.2. Canonical task status cutover. Apply only after the M05 client is available.
BEGIN;
SET LOCAL lock_timeout='5s';

LOCK TABLE private.pedidos_v1_rollout,public.pedidos,public.tarefas
  IN ACCESS EXCLUSIVE MODE NOWAIT;

DO $$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM private.pedidos_v1_rollout
    WHERE singleton AND status_mode='legacy' AND timeline_mode='legacy'
  ) THEN
    RAISE EXCEPTION 'Canonical activation requires legacy/legacy rollout mode' USING ERRCODE='55000';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='public.tarefas'::regclass
      AND tgname='tarefas_sync_legacy_state' AND tgenabled='O'
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='public.tarefas'::regclass
      AND tgname='tarefas_z_stamp_update' AND tgenabled='O'
  ) THEN
    RAISE EXCEPTION 'Expected legacy task triggers are not enabled' USING ERRCODE='55000';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.pedidos
    WHERE status NOT IN(
      'Ação Pendente','Aguardando Cliente','Prazo Concessionária','Concluído',
      'Em andamento','Finalizado','Cancelado'
    )
  ) OR EXISTS(
    SELECT 1 FROM public.tarefas
    WHERE status IS NOT NULL
      AND status IS DISTINCT FROM CASE WHEN concluido THEN 'Concluída' ELSE 'Aberta' END
  ) THEN
    RAISE EXCEPTION 'Unexpected workflow delta requires review before activation' USING ERRCODE='23514';
  END IF;
END;
$$;

DROP TRIGGER tarefas_sync_legacy_state ON public.tarefas;
DROP FUNCTION private.sync_legacy_pedido_task_state();

-- Reconcile writes made by legacy clients after M04 without changing their
-- historical updated_at values. The table lock covers trigger suspension.
ALTER TABLE public.tarefas DISABLE TRIGGER tarefas_z_stamp_update;
UPDATE public.tarefas SET status=CASE WHEN concluido THEN 'Concluída' ELSE 'Aberta' END
WHERE status IS NULL OR status IS DISTINCT FROM CASE WHEN concluido THEN 'Concluída' ELSE 'Aberta' END;
ALTER TABLE public.tarefas ENABLE TRIGGER tarefas_z_stamp_update;

UPDATE public.pedidos SET status=CASE
  WHEN status='Concluído' THEN 'Finalizado'
  WHEN status IN('Ação Pendente','Aguardando Cliente','Prazo Concessionária') THEN 'Em andamento'
  ELSE status END
WHERE status IN('Ação Pendente','Aguardando Cliente','Prazo Concessionária','Concluído');

CREATE FUNCTION private.sync_pedido_task_canonical_state()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
  projected_completion boolean;
BEGIN
  IF NEW.status IS NULL OR NEW.status NOT IN('Aberta','Em andamento','Aguardando','Concluída') THEN
    RAISE EXCEPTION 'Canonical task status is required' USING ERRCODE='22023';
  END IF;
  projected_completion:=NEW.status='Concluída';

  IF TG_OP='INSERT' THEN
    IF NEW.concluido IS DISTINCT FROM projected_completion THEN
      RAISE EXCEPTION 'Task completion bool must match canonical status' USING ERRCODE='23514';
    END IF;
  ELSE
    IF NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.concluido IS DISTINCT FROM OLD.concluido THEN
      RAISE EXCEPTION 'Legacy completion writes are no longer supported; reload the application'
        USING ERRCODE='23514';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.concluido IS DISTINCT FROM OLD.concluido
       AND NEW.concluido IS DISTINCT FROM projected_completion THEN
      RAISE EXCEPTION 'Task completion bool conflicts with canonical status' USING ERRCODE='23514';
    END IF;
  END IF;

  NEW.concluido:=projected_completion;
  IF projected_completion THEN
    NEW.concluida_em:=coalesce(NEW.concluida_em,
      CASE WHEN TG_OP='UPDATE' THEN OLD.concluida_em ELSE NULL END,
      statement_timestamp());
  ELSE
    NEW.concluida_em:=NULL;
  END IF;
  IF TG_OP='UPDATE' AND OLD.status='Aguardando' AND NEW.status<>'Aguardando' THEN
    NEW.waiting_type:=NULL;
    NEW.waiting_user_id:=NULL;
    NEW.waiting_note:=NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.sync_pedido_task_canonical_state() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER tarefas_sync_canonical_state BEFORE INSERT OR UPDATE ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION private.sync_pedido_task_canonical_state();

UPDATE private.pedidos_v1_rollout SET status_mode='v1' WHERE singleton;

REVOKE INSERT,UPDATE ON TABLE public.pedidos FROM PUBLIC,anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON TABLE public.tarefas FROM PUBLIC,anon,authenticated;
COMMIT;
