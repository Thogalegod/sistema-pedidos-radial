-- M12: expand atividades and capture legacy comment deltas while legacy remains canonical.
BEGIN;

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM private.pedidos_v1_rollout WHERE singleton AND status_mode='v1' AND timeline_mode='legacy')
     OR EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='atividades' AND column_name='source_comment_id') THEN
    RAISE EXCEPTION 'Unexpected M12 predecessor/state' USING ERRCODE='55000';
  END IF;
END $$;

ALTER TABLE public.atividades
  ALTER COLUMN pedido_id DROP NOT NULL,
  ADD COLUMN tipo text NOT NULL DEFAULT 'manual',
  ADD COLUMN frente_id uuid,
  ADD COLUMN tarefa_id uuid,
  ADD COLUMN source_comment_id uuid,
  ADD COLUMN event_type text,
  ADD COLUMN follow_up_date date,
  ADD CONSTRAINT atividades_tipo_check CHECK(tipo IN ('manual','system')),
  ADD CONSTRAINT atividades_owner_check CHECK(pedido_id IS NOT NULL OR tarefa_id IS NOT NULL),
  ADD CONSTRAINT atividades_tarefa_org_fkey FOREIGN KEY(organization_id,tarefa_id)
    REFERENCES public.tarefas(organization_id,id) ON DELETE CASCADE;

UPDATE public.atividades SET tipo='system' WHERE migration_key LIKE 'system:%';
CREATE UNIQUE INDEX atividades_org_source_comment_uidx
  ON public.atividades(organization_id,source_comment_id) WHERE source_comment_id IS NOT NULL;
CREATE INDEX atividades_org_tarefa_idx ON public.atividades(organization_id,tarefa_id,criado_em DESC);

CREATE FUNCTION private.validate_pedido_activity_links()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE task_order uuid; task_front uuid;
BEGIN
  IF NEW.tarefa_id IS NOT NULL THEN
    SELECT pedido_id,frente_id INTO task_order,task_front FROM public.tarefas
      WHERE organization_id=NEW.organization_id AND id=NEW.tarefa_id;
    IF NOT FOUND OR NEW.pedido_id IS DISTINCT FROM task_order THEN
      RAISE EXCEPTION 'Activity task/order mismatch' USING ERRCODE='23514';
    END IF;
    IF NEW.frente_id IS NOT NULL AND NEW.frente_id IS DISTINCT FROM task_front THEN
      RAISE EXCEPTION 'Activity task/front mismatch' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.frente_id IS NOT NULL THEN
    IF NEW.pedido_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.pedido_frentes f
      WHERE f.organization_id=NEW.organization_id AND f.pedido_id=NEW.pedido_id AND f.id=NEW.frente_id) THEN
      RAISE EXCEPTION 'Activity front/order mismatch' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.validate_pedido_activity_links() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER atividades_validate_links BEFORE INSERT OR UPDATE OF organization_id,pedido_id,frente_id,tarefa_id
  ON public.atividades FOR EACH ROW EXECUTE FUNCTION private.validate_pedido_activity_links();

CREATE FUNCTION private.protect_pedido_activity_kind()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF current_user IN ('anon','authenticated') AND
    (NEW.tipo<>'manual' OR NEW.source_comment_id IS NOT NULL OR NEW.event_type IS NOT NULL) THEN
    RAISE EXCEPTION 'System activities can only be written by approved commands' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.protect_pedido_activity_kind() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER atividades_protect_kind BEFORE INSERT OR UPDATE OF tipo,source_comment_id,event_type
  ON public.atividades FOR EACH ROW EXECUTE FUNCTION private.protect_pedido_activity_kind();

CREATE FUNCTION private.project_pedido_legacy_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE task_order uuid; task_front uuid; task_follow_up date;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM private.pedidos_v1_rollout WHERE singleton AND timeline_mode='copying') THEN
    RETURN coalesce(NEW,OLD);
  END IF;
  IF TG_OP='DELETE' THEN
    DELETE FROM public.atividades WHERE organization_id=OLD.organization_id AND source_comment_id=OLD.id;
    RETURN OLD;
  END IF;
  SELECT pedido_id,frente_id,follow_up_date INTO task_order,task_front,task_follow_up
    FROM public.tarefas WHERE organization_id=NEW.organization_id AND id=NEW.tarefa_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comment task not found' USING ERRCODE='23503'; END IF;
  INSERT INTO public.atividades(organization_id,pedido_id,frente_id,tarefa_id,descricao,usuario,user_id,
    criado_em,tipo,source_comment_id,event_type,follow_up_date)
  VALUES(NEW.organization_id,task_order,task_front,NEW.tarefa_id,NEW.texto,NEW.usuario,NEW.user_id,
    NEW.criado_em,CASE WHEN NEW.event_type IS NULL THEN 'manual' ELSE 'system' END,NEW.id,NEW.event_type,task_follow_up)
  ON CONFLICT (organization_id,source_comment_id) WHERE source_comment_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.project_pedido_legacy_comment() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER comentarios_tarefa_project_activity AFTER INSERT OR DELETE ON public.comentarios_tarefa
  FOR EACH ROW EXECUTE FUNCTION private.project_pedido_legacy_comment();

UPDATE private.pedidos_v1_rollout SET timeline_mode='copying' WHERE singleton AND timeline_mode='legacy';
COMMIT;
