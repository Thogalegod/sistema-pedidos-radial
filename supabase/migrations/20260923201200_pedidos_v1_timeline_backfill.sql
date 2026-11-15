-- M13: backfill every valid legacy task comment into atividades, keeping legacy canonical.
BEGIN;

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM private.pedidos_v1_rollout WHERE singleton AND timeline_mode='copying')
     OR to_regprocedure('private.project_pedido_legacy_comment_row(uuid,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected M13 predecessor/state' USING ERRCODE='55000';
  END IF;
END $$;

CREATE FUNCTION private.project_pedido_legacy_comment_row(p_org uuid,p_comment uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE comment_row public.comentarios_tarefa%ROWTYPE; task_order uuid; task_front uuid; task_follow_up date;
BEGIN
  SELECT * INTO comment_row FROM public.comentarios_tarefa
    WHERE organization_id=p_org AND id=p_comment FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT pedido_id,frente_id,follow_up_date INTO task_order,task_front,task_follow_up
    FROM public.tarefas WHERE organization_id=p_org AND id=comment_row.tarefa_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comment without recoverable task: %',p_comment USING ERRCODE='23503'; END IF;
  INSERT INTO public.atividades(organization_id,pedido_id,frente_id,tarefa_id,descricao,usuario,user_id,
    criado_em,tipo,source_comment_id,event_type,follow_up_date)
  VALUES(comment_row.organization_id,task_order,task_front,comment_row.tarefa_id,comment_row.texto,
    comment_row.usuario,comment_row.user_id,comment_row.criado_em,
    CASE WHEN comment_row.event_type IS NULL THEN 'manual' ELSE 'system' END,
    comment_row.id,comment_row.event_type,task_follow_up)
  ON CONFLICT (organization_id,source_comment_id) WHERE source_comment_id IS NOT NULL DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION private.project_pedido_legacy_comment_row(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.project_pedido_legacy_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM private.pedidos_v1_rollout WHERE singleton AND timeline_mode='copying') THEN
    RETURN coalesce(NEW,OLD);
  END IF;
  IF TG_OP='DELETE' THEN
    DELETE FROM public.atividades WHERE organization_id=OLD.organization_id AND source_comment_id=OLD.id;
    RETURN OLD;
  END IF;
  PERFORM private.project_pedido_legacy_comment_row(NEW.organization_id,NEW.id);
  RETURN NEW;
END $$;

LOCK TABLE public.comentarios_tarefa IN SHARE MODE;
DO $$
DECLARE item record;
BEGIN
  IF EXISTS(
    SELECT 1 FROM public.comentarios_tarefa c LEFT JOIN public.tarefas t
      ON t.organization_id=c.organization_id AND t.id=c.tarefa_id
    WHERE t.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Timeline backfill blocked: comment without recoverable task' USING ERRCODE='55000';
  END IF;
  FOR item IN SELECT organization_id,id FROM public.comentarios_tarefa ORDER BY organization_id,criado_em,id LOOP
    PERFORM private.project_pedido_legacy_comment_row(item.organization_id,item.id);
  END LOOP;
  IF EXISTS(
    SELECT 1 FROM public.comentarios_tarefa c LEFT JOIN public.atividades a
      ON a.organization_id=c.organization_id AND a.source_comment_id=c.id
    WHERE a.id IS NULL OR (a.descricao,a.usuario,a.user_id,a.criado_em)
      IS DISTINCT FROM (c.texto,c.usuario,c.user_id,c.criado_em)
  ) THEN
    RAISE EXCEPTION 'Timeline backfill verification failed' USING ERRCODE='55000';
  END IF;
END $$;

COMMIT;
