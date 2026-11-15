-- M04 / 1B.2. Run transactionally only after compatible readers are published.
-- Preserve legacy identities and dates; provenance dates describe this migration.
SET LOCAL lock_timeout='5s';
ALTER TABLE public.atividades ADD COLUMN IF NOT EXISTS migration_key text;
CREATE UNIQUE INDEX IF NOT EXISTS atividades_org_migration_key_uidx
  ON public.atividades(organization_id,migration_key) WHERE migration_key IS NOT NULL;

CREATE OR REPLACE FUNCTION private.backfill_pedidos_v1()
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  -- Migration-only boundary. Fail immediately on concurrent use, without partial
  -- changes or disabling validation triggers in another transaction.
  LOCK TABLE private.pedidos_v1_rollout,public.pedidos,public.pedido_frentes,
    public.tarefas,public.organization_members,public.atividades IN ACCESS EXCLUSIVE MODE NOWAIT;
  IF NOT EXISTS(SELECT 1 FROM private.pedidos_v1_rollout WHERE singleton AND status_mode='legacy') THEN
    RAISE EXCEPTION 'Backfill requires legacy workflow mode' USING ERRCODE='55000';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.tarefas'::regclass
    AND tgname='tarefas_z_stamp_update' AND tgenabled='O') THEN
    RAISE EXCEPTION 'Expected enabled task timestamp trigger' USING ERRCODE='55000';
  END IF;
  IF EXISTS(SELECT 1 FROM public.tarefas t LEFT JOIN public.organization_members m
    ON m.organization_id=t.organization_id AND m.user_id=t.responsavel_user_id
    WHERE t.responsavel_user_id IS NOT NULL AND m.user_id IS NULL) THEN
    RAISE EXCEPTION 'Invalid historical assignee requires explicit repair before backfill' USING ERRCODE='23503';
  END IF;
  IF EXISTS(SELECT 1 FROM public.pedidos WHERE status NOT IN
    ('Ação Pendente','Aguardando Cliente','Prazo Concessionária','Concluído','Em andamento','Finalizado','Cancelado'))
    OR EXISTS(SELECT 1 FROM public.tarefas WHERE status IS NOT NULL
      AND status IS DISTINCT FROM CASE WHEN concluido THEN 'Concluída' ELSE 'Aberta' END) THEN
    RAISE EXCEPTION 'Unexpected workflow state requires review before backfill' USING ERRCODE='23514';
  END IF;

  INSERT INTO public.atividades(organization_id,pedido_id,descricao,usuario,migration_key,criado_em)
  SELECT organization_id,id,
    'Migração V1 em '||pg_catalog.to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')
      ||'. Status anterior: '||status||'. Registro de migração; não é a data original da mudança.',
    'Sistema','pedidos-v1-status:'||id,statement_timestamp()
  FROM public.pedidos WHERE status IN('Ação Pendente','Aguardando Cliente','Prazo Concessionária','Concluído')
  ON CONFLICT (organization_id,migration_key) WHERE migration_key IS NOT NULL DO NOTHING;

  INSERT INTO public.pedido_frentes(organization_id,pedido_id,nome,ordem,is_legacy_default)
  SELECT organization_id,id,'Geral',0,true FROM public.pedidos
  ON CONFLICT(organization_id,pedido_id) WHERE is_legacy_default DO NOTHING;

  -- Only timestamp stamping is suspended. Membership, tenant and workflow
  -- validation remain active; the table lock covers disable/update/enable.
  ALTER TABLE public.tarefas DISABLE TRIGGER tarefas_z_stamp_update;
  UPDATE public.tarefas t SET
    frente_id=coalesce(t.frente_id,f.id),
    status=CASE WHEN t.concluido THEN 'Concluída' ELSE 'Aberta' END
  FROM public.pedido_frentes f WHERE f.organization_id=t.organization_id
    AND f.pedido_id=t.pedido_id AND f.is_legacy_default
    AND (t.frente_id IS NULL OR t.status IS NULL);
  ALTER TABLE public.tarefas ENABLE TRIGGER tarefas_z_stamp_update;

  UPDATE public.pedidos SET status=CASE WHEN status='Concluído' THEN 'Finalizado' ELSE 'Em andamento' END
  WHERE status IN('Ação Pendente','Aguardando Cliente','Prazo Concessionária','Concluído');
END;
$$;
REVOKE ALL ON FUNCTION private.backfill_pedidos_v1() FROM PUBLIC,anon,authenticated;
SELECT private.backfill_pedidos_v1();
