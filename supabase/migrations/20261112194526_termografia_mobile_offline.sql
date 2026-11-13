-- Applied to IURQ on 2026-11-12 as migration 20261112194526_termografia_mobile_offline.
-- Transactional QA passed; production Storage byte/device QA is tracked separately.
-- Additive mobile metadata; historical rows keep NULL mobile state and legacy behavior.
BEGIN;

ALTER TABLE public.relatorios_termografia
  ADD COLUMN IF NOT EXISTS mobile_sync_state text,
  ADD COLUMN IF NOT EXISTS mobile_snapshot_hash text,
  ADD COLUMN IF NOT EXISTS mobile_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS parent_report_id uuid;
ALTER TABLE public.termografia_pontos ADD COLUMN IF NOT EXISTS metadados_coleta jsonb;
ALTER TABLE public.termografia_arquivos
  ADD COLUMN IF NOT EXISTS content_sha256 text,
  ADD COLUMN IF NOT EXISTS image_width integer,
  ADD COLUMN IF NOT EXISTS image_height integer;
ALTER TABLE public.relatorios_termografia ADD CONSTRAINT termografia_mobile_state_check CHECK (
  (mobile_sync_state IS NULL AND mobile_snapshot_hash IS NULL AND mobile_snapshot IS NULL AND parent_report_id IS NULL)
  OR (mobile_sync_state IS NOT NULL AND mobile_snapshot_hash IS NOT NULL AND mobile_sync_state IN ('pending','complete') AND mobile_snapshot_hash ~ '^[a-f0-9]{64}$' AND mobile_snapshot IS NOT NULL)
);
ALTER TABLE public.relatorios_termografia ADD CONSTRAINT termografia_mobile_parent_org_fkey
  FOREIGN KEY (organization_id,parent_report_id) REFERENCES public.relatorios_termografia(organization_id,id) ON DELETE RESTRICT;
ALTER TABLE public.termografia_arquivos ADD CONSTRAINT termografia_mobile_file_check CHECK (
  (content_sha256 IS NULL AND image_width IS NULL AND image_height IS NULL)
  OR (content_sha256 IS NOT NULL AND image_width IS NOT NULL AND image_height IS NOT NULL AND tamanho_bytes IS NOT NULL AND content_sha256 ~ '^[a-f0-9]{64}$' AND image_width > 0 AND image_height > 0 AND tamanho_bytes > 0 AND tamanho_bytes <= 10485760)
);
-- This is a CONSTRAINT in the verified schema, not an independently droppable index.
ALTER TABLE public.termografia_arquivos DROP CONSTRAINT termografia_arquivos_point_tipo_uidx;
CREATE INDEX IF NOT EXISTS termografia_arquivos_point_tipo_idx ON public.termografia_arquivos(organization_id,point_id,tipo);

CREATE OR REPLACE FUNCTION public.validate_termografia_mobile_snapshot(s jsonb, report_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE p jsonb; f jsonb; h jsonb; a jsonb; xy jsonb; m jsonb; v_id uuid;
  ids uuid[] := ARRAY[report_id]; photo_ids uuid[] := '{}'; point_ids uuid[] := '{}'; n integer := 0;
BEGIN
  IF jsonb_typeof(s) IS DISTINCT FROM 'object' OR s->>'version' IS DISTINCT FROM '1'
    OR jsonb_typeof(s->'report') IS DISTINCT FROM 'object'
    OR jsonb_typeof(s->'points') IS DISTINCT FROM 'array' OR jsonb_array_length(s->'points')=0
    OR jsonb_typeof(s->'files') IS DISTINCT FROM 'array'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(s) k WHERE k NOT IN ('version','report','points','files','sourceReportId')) THEN
    RAISE EXCEPTION 'Snapshot de coleta incompatível';
  END IF;
  IF nullif(btrim(s->'report'->>'cliente_nome'),'') IS NULL OR (s->'report'->>'data_execucao') IS NULL
    OR (s->'report'->>'revisao') !~ '^[0-9]+$'
    OR s->'report'->>'status' NOT IN ('gerado','revisado','emitido','cancelado')
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(s->'report') k WHERE k NOT IN ('cliente_nome','data_execucao','cliente_cnpj','cliente_endereco','cliente_cidade','cliente_uf','cliente_cep','objetivo','equipamento','responsavel_nome','responsavel_crea','revisao','status')) THEN
    RAISE EXCEPTION 'Dados gerais da coleta inválidos';
  END IF;
  PERFORM (s->'report'->>'data_execucao')::date;
  IF s ? 'sourceReportId' THEN PERFORM (s->>'sourceReportId')::uuid; END IF;
  FOR f IN SELECT value FROM jsonb_array_elements(s->'files') LOOP
    IF jsonb_typeof(f) IS DISTINCT FROM 'object' OR f->>'kind' NOT IN ('digital','termica')
      OR coalesce(f->>'contentType','') NOT LIKE 'image/%' OR coalesce(f->>'fileName','') IN ('','.','..')
      OR position('/' in f->>'fileName')>0 OR position(chr(92) in f->>'fileName')>0
      OR coalesce(f->>'sha256','') !~ '^[a-f0-9]{64}$'
      OR coalesce(f->>'size','') !~ '^[1-9][0-9]*$' OR (f->>'size')::bigint>10485760
      OR coalesce(f->>'width','') !~ '^[1-9][0-9]*$' OR coalesce(f->>'height','') !~ '^[1-9][0-9]*$'
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(f) k WHERE k NOT IN ('id','pointId','kind','fileName','storagePath','contentType','size','sha256','width','height')) THEN
      RAISE EXCEPTION 'Descritor de foto inválido';
    END IF;
    v_id := (f->>'id')::uuid;
    IF v_id IS NULL OR v_id=ANY(ids) THEN RAISE EXCEPTION 'ID de foto duplicado/inválido'; END IF;
    ids := array_append(ids,v_id); photo_ids := array_append(photo_ids,v_id);
    IF (f->>'pointId') IS NULL THEN RAISE EXCEPTION 'Quadro da foto ausente'; END IF;
    PERFORM (f->>'pointId')::uuid;
  END LOOP;
  FOR p IN SELECT value FROM jsonb_array_elements(s->'points') LOOP
    n := n+1; v_id := (p->>'id')::uuid; m := p->'metadata';
    IF v_id IS NULL OR v_id=ANY(ids) OR coalesce(p->>'ordem','')<>n::text
      OR nullif(btrim(p->>'setor'),'') IS NULL OR nullif(btrim(p->>'local'),'') IS NULL
      OR jsonb_typeof(m) IS DISTINCT FROM 'object' OR m->>'version' IS DISTINCT FROM '1'
      OR coalesce(m->>'inspectionStatus','') NOT IN ('pending','inspected','no-load','inaccessible')
      OR jsonb_typeof(m->'inspectionReason') IS DISTINCT FROM 'string'
      OR (m->>'inspectionStatus' IN ('no-load','inaccessible') AND nullif(btrim(m->>'inspectionReason'),'') IS NULL)
      OR jsonb_typeof(m->'photoIds') IS DISTINCT FROM 'array' OR jsonb_typeof(m->'hotspots') IS DISTINCT FROM 'array'
      OR jsonb_typeof(m->'annotations') IS DISTINCT FROM 'array'
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE k NOT IN ('id','ordem','setor','local','equipamento','metadata'))
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(m) k WHERE k NOT IN ('version','inspectionStatus','inspectionReason','photoIds','hotspots','annotations')) THEN
      RAISE EXCEPTION 'Metadados versionados do quadro inválidos';
    END IF;
    ids := array_append(ids,v_id); point_ids := array_append(point_ids,v_id);
    IF (SELECT count(*) FROM jsonb_array_elements_text(m->'photoIds')) <> (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(m->'photoIds'))
      OR (SELECT count(*) FROM jsonb_array_elements_text(m->'photoIds')) <> (SELECT count(*) FROM jsonb_array_elements(s->'files') v WHERE v->>'pointId'=p->>'id')
      OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(m->'photoIds') v WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s->'files') x WHERE x->>'id'=v AND x->>'pointId'=p->>'id')) THEN
      RAISE EXCEPTION 'Fotos do quadro inconsistentes';
    END IF;
    FOR h IN SELECT value FROM jsonb_array_elements(m->'hotspots') LOOP
      v_id := (h->>'id')::uuid;
      IF v_id IS NULL OR v_id=ANY(ids) OR jsonb_typeof(h->'componente') IS DISTINCT FROM 'string'
        OR jsonb_typeof(h->'temperatura') IS DISTINCT FROM 'string' OR jsonb_typeof(h->'conclusao') IS DISTINCT FROM 'string'
        OR (h ? 'descricao' AND jsonb_typeof(h->'descricao') IS DISTINCT FROM 'string')
        OR (h ? 'classificacao' AND h->>'classificacao' NOT IN ('Normal','Observação','Intervenção Programada','Intervenção Imediata','Crítico'))
        OR (h ? 'risco' AND h->>'risco' NOT IN ('Baixo','Médio','Alto'))
        OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s->'files') x WHERE x->>'id'=h->>'photoId' AND x->>'pointId'=p->>'id' AND x->>'kind'='termica')
        OR EXISTS(SELECT 1 FROM jsonb_object_keys(h) k WHERE k NOT IN ('id','photoId','componente','temperatura','conclusao','descricao','classificacao','risco')) THEN
        RAISE EXCEPTION 'Aquecimento inválido ou associado a outra imagem';
      END IF;
      ids := array_append(ids,v_id);
    END LOOP;
    FOR a IN SELECT value FROM jsonb_array_elements(m->'annotations') LOOP
      v_id := (a->>'id')::uuid;
      IF v_id IS NULL OR v_id=ANY(ids) OR coalesce(a->>'tool','') NOT IN ('point','circle','arrow','freehand')
        OR coalesce(a->>'color','') !~ '^#[a-fA-F0-9]{6}$' OR jsonb_typeof(a->'strokeWidth') IS DISTINCT FROM 'number'
        OR (a->>'strokeWidth')::numeric<=0 OR (a->>'strokeWidth')::numeric>1
        OR jsonb_typeof(a->'points') IS DISTINCT FROM 'array' OR jsonb_array_length(a->'points')=0
        OR (a->>'tool' IN ('circle','arrow') AND jsonb_array_length(a->'points')<>2)
        OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s->'files') x WHERE x->>'id'=a->>'photoId' AND x->>'pointId'=p->>'id' AND x->>'kind'='digital')
        OR (a ? 'hotspotId' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m->'hotspots') x WHERE x->>'id'=a->>'hotspotId'))
        OR EXISTS(SELECT 1 FROM jsonb_object_keys(a) k WHERE k NOT IN ('id','photoId','hotspotId','tool','color','strokeWidth','points')) THEN
        RAISE EXCEPTION 'Marcação digital inválida';
      END IF;
      FOR xy IN SELECT value FROM jsonb_array_elements(a->'points') LOOP
        IF jsonb_typeof(xy) IS DISTINCT FROM 'object' OR jsonb_typeof(xy->'x') IS DISTINCT FROM 'number' OR jsonb_typeof(xy->'y') IS DISTINCT FROM 'number'
          OR (xy->>'x')::numeric<0 OR (xy->>'x')::numeric>1 OR (xy->>'y')::numeric<0 OR (xy->>'y')::numeric>1
          OR EXISTS(SELECT 1 FROM jsonb_object_keys(xy) k WHERE k NOT IN ('x','y')) THEN RAISE EXCEPTION 'Coordenadas proporcionais inválidas'; END IF;
      END LOOP;
      ids := array_append(ids,v_id);
    END LOOP;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'files') x WHERE NOT ((x->>'pointId')::uuid=ANY(point_ids))) THEN RAISE EXCEPTION 'Foto de outro quadro'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_termografia_mobile_user(expected_user uuid, organization_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM expected_user OR NOT coalesce(public.is_organization_member(organization_id),false) THEN
    RAISE EXCEPTION 'A conta ou organização da coleta mudou' USING ERRCODE='42501';
  END IF;
END;
$$;

-- A report stores only IDs, digests and prepared file descriptors. Point values,
-- hotspots and annotations exist solely in normalized termografia_pontos rows.
CREATE OR REPLACE FUNCTION public.termografia_mobile_report_data(r public.relatorios_termografia)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT jsonb_build_object('cliente_nome',r.cliente_nome,'data_execucao',r.data_execucao,'cliente_cnpj',r.cliente_cnpj,'cliente_endereco',r.cliente_endereco,'cliente_cidade',r.cliente_cidade,'cliente_uf',r.cliente_uf,'cliente_cep',r.cliente_cep,'objetivo',r.objetivo,'equipamento',r.equipamento,'responsavel_nome',r.responsavel_nome,'responsavel_crea',r.responsavel_crea,'revisao',r.revisao,'status',r.status);
$$;
CREATE OR REPLACE FUNCTION public.termografia_mobile_reconstructed_snapshot(r public.relatorios_termografia)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT jsonb_build_object('version',1,'report',public.termografia_mobile_report_data(r),'files',r.mobile_snapshot->'files','points',coalesce((
    SELECT jsonb_agg(jsonb_build_object('id',p.id,'ordem',p.ordem,'setor',p.setor,'local',p.local,'equipamento',p.equipamento,'metadata',p.metadados_coleta) ORDER BY p.ordem)
    FROM public.termografia_pontos p WHERE p.organization_id=r.organization_id AND p.report_id=r.id
  ),'[]'::jsonb)) || CASE WHEN r.parent_report_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('sourceReportId',r.parent_report_id) END;
$$;
CREATE OR REPLACE FUNCTION public.check_termografia_mobile_complete(r public.relatorios_termografia)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE f jsonb; p jsonb; expected jsonb; saved public.termografia_arquivos;
BEGIN
  expected:=public.termografia_mobile_reconstructed_snapshot(r);
  PERFORM public.validate_termografia_mobile_snapshot(expected,r.id);
  IF (SELECT count(*) FROM public.termografia_pontos WHERE organization_id=r.organization_id AND report_id=r.id)<>jsonb_array_length(r.mobile_snapshot->'pointDigests')
    OR (SELECT count(*) FROM public.termografia_arquivos WHERE organization_id=r.organization_id AND report_id=r.id)<>jsonb_array_length(r.mobile_snapshot->'files') THEN
    RAISE EXCEPTION 'Conjunto de quadros/fotos ainda incompleto';
  END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(expected->'points') LOOP
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.mobile_snapshot->'pointDigests') x WHERE x->>'id'=p->>'id' AND x->>'digest'=encode(sha256(convert_to(p::text,'UTF8')),'hex')) THEN RAISE EXCEPTION 'Quadro divergente do snapshot'; END IF;
  END LOOP;
  FOR f IN SELECT value FROM jsonb_array_elements(r.mobile_snapshot->'files') LOOP
    SELECT * INTO saved FROM public.termografia_arquivos WHERE organization_id=r.organization_id AND report_id=r.id AND id=(f->>'id')::uuid;
    IF NOT FOUND OR saved.point_id IS DISTINCT FROM (f->>'pointId')::uuid OR saved.tipo IS DISTINCT FROM f->>'kind'
      OR saved.storage_path IS DISTINCT FROM f->>'storagePath' OR saved.file_name IS DISTINCT FROM f->>'fileName'
      OR saved.content_type IS DISTINCT FROM f->>'contentType' OR saved.tamanho_bytes IS DISTINCT FROM (f->>'size')::bigint
      OR saved.content_sha256 IS DISTINCT FROM f->>'sha256' OR saved.image_width IS DISTINCT FROM (f->>'width')::integer OR saved.image_height IS DISTINCT FROM (f->>'height')::integer
      OR NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='termografia-docs' AND o.name=saved.storage_path) THEN
      RAISE EXCEPTION 'Foto/objeto remoto ainda não confirmado';
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_termografia_mobile_report()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE parent public.relatorios_termografia; expected jsonb;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.mobile_sync_state IS NOT NULL THEN RAISE EXCEPTION 'Coleta remota imutável; crie uma nova revisão'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.mobile_sync_state IS NULL AND NEW.mobile_sync_state IS NULL THEN RETURN NEW; END IF;
    IF OLD.mobile_sync_state IS NULL OR OLD.mobile_sync_state='complete' OR NEW.mobile_sync_state IS DISTINCT FROM 'complete'
      OR (to_jsonb(OLD)-'updated_at'-'mobile_sync_state') IS DISTINCT FROM (to_jsonb(NEW)-'updated_at'-'mobile_sync_state') THEN
      RAISE EXCEPTION 'Snapshot imutável; alterações exigem nova revisão';
    END IF;
    PERFORM public.check_termografia_mobile_complete(NEW); RETURN NEW;
  END IF;
  IF NEW.mobile_sync_state IS NULL THEN
    IF NEW.mobile_snapshot IS NOT NULL OR NEW.mobile_snapshot_hash IS NOT NULL OR NEW.parent_report_id IS NOT NULL THEN RAISE EXCEPTION 'Estado da coleta ausente'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.mobile_sync_state<>'pending' THEN RAISE EXCEPTION 'Coleta deve iniciar pendente'; END IF;
  IF jsonb_typeof(NEW.mobile_snapshot) IS DISTINCT FROM 'object' OR NEW.mobile_snapshot->>'version' IS DISTINCT FROM '1'
    OR jsonb_typeof(NEW.mobile_snapshot->'pointDigests') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.mobile_snapshot->'pointDigests')=0
    OR jsonb_typeof(NEW.mobile_snapshot->'files') IS DISTINCT FROM 'array'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(NEW.mobile_snapshot) k WHERE k NOT IN ('version','reportDigest','pointDigests','files'))
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.mobile_snapshot->'pointDigests') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'object' OR coalesce(x->>'digest','') !~ '^[a-f0-9]{64}$' OR (x->>'id') IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(x) k WHERE k NOT IN ('id','digest')))
    OR (SELECT count(*) FROM jsonb_array_elements(NEW.mobile_snapshot->'pointDigests'))<>(SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(NEW.mobile_snapshot->'pointDigests') x) THEN RAISE EXCEPTION 'Manifesto de envio inválido'; END IF;
  expected := public.termografia_mobile_report_data(NEW);
  IF encode(sha256(convert_to(expected::text,'UTF8')),'hex') IS DISTINCT FROM NEW.mobile_snapshot->>'reportDigest' THEN RAISE EXCEPTION 'Dados gerais divergentes do snapshot'; END IF;
  IF NEW.parent_report_id IS NOT NULL THEN
    SELECT * INTO parent FROM public.relatorios_termografia WHERE organization_id=NEW.organization_id AND id=NEW.parent_report_id FOR KEY SHARE;
    IF NOT FOUND OR parent.mobile_sync_state IS DISTINCT FROM 'complete' OR NEW.revisao<>parent.revisao+1 THEN RAISE EXCEPTION 'Origem/revisão inválida'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_termografia_mobile_report_trig BEFORE INSERT OR UPDATE OR DELETE ON public.relatorios_termografia FOR EACH ROW EXECUTE FUNCTION public.protect_termografia_mobile_report();

CREATE OR REPLACE FUNCTION public.protect_termografia_mobile_children()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE r public.relatorios_termografia; v jsonb; row_data jsonb; org uuid; report uuid;
BEGIN
  row_data := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  org := (row_data->>'organization_id')::uuid; report := (row_data->>'report_id')::uuid;
  SELECT * INTO r FROM public.relatorios_termografia WHERE organization_id=org AND id=report FOR UPDATE;
  IF r.mobile_sync_state IS NULL THEN
    IF TG_TABLE_NAME='termografia_pontos' AND row_data->'metadados_coleta' IS NOT NULL AND row_data->'metadados_coleta'<>'null'::jsonb THEN RAISE EXCEPTION 'Metadados móveis exigem relatório versionado'; END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
  END IF;
  IF TG_OP<>'INSERT' OR r.mobile_sync_state<>'pending' THEN RAISE EXCEPTION 'Quadros e arquivos da coleta são imutáveis; crie nova revisão'; END IF;
  IF TG_TABLE_NAME='termografia_pontos' THEN
    SELECT value INTO v FROM jsonb_array_elements(r.mobile_snapshot->'pointDigests') WHERE value->>'id'=NEW.id::text;
    IF v IS NULL OR v->>'digest' IS DISTINCT FROM encode(sha256(convert_to(jsonb_build_object('id',NEW.id,'ordem',NEW.ordem,'setor',NEW.setor,'local',NEW.local,'equipamento',NEW.equipamento,'metadata',NEW.metadados_coleta)::text,'UTF8')),'hex')
      OR NEW.inspecionado IS DISTINCT FROM (NEW.metadados_coleta->>'inspectionStatus'='inspected')
      OR NEW.ocorrencia IS DISTINCT FROM (jsonb_array_length(NEW.metadados_coleta->'hotspots')>0)
      OR NEW.componente IS NOT NULL OR NEW.temperatura IS NOT NULL OR NEW.conclusao IS NOT NULL OR NEW.diagnostico IS NOT NULL OR NEW.recomendacao IS NOT NULL OR NEW.classificacao IS NOT NULL OR NEW.risco IS NOT NULL OR NEW.data_hora_foto IS NOT NULL THEN RAISE EXCEPTION 'Quadro divergente do snapshot'; END IF;
  ELSE
    SELECT value INTO v FROM jsonb_array_elements(r.mobile_snapshot->'files') WHERE value->>'id'=NEW.id::text;
    IF v IS NULL OR NEW.point_id IS DISTINCT FROM (v->>'pointId')::uuid OR NEW.tipo IS DISTINCT FROM v->>'kind'
      OR NEW.storage_path IS DISTINCT FROM v->>'storagePath' OR NEW.file_name IS DISTINCT FROM v->>'fileName' OR NEW.content_type IS DISTINCT FROM v->>'contentType'
      OR NEW.tamanho_bytes IS DISTINCT FROM (v->>'size')::bigint OR NEW.content_sha256 IS DISTINCT FROM v->>'sha256'
      OR NEW.image_width IS DISTINCT FROM (v->>'width')::integer OR NEW.image_height IS DISTINCT FROM (v->>'height')::integer THEN RAISE EXCEPTION 'Arquivo divergente do snapshot'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_termografia_mobile_points_trig BEFORE INSERT OR UPDATE OR DELETE ON public.termografia_pontos FOR EACH ROW EXECUTE FUNCTION public.protect_termografia_mobile_children();
CREATE TRIGGER protect_termografia_mobile_files_trig BEFORE INSERT OR UPDATE OR DELETE ON public.termografia_arquivos FOR EACH ROW EXECUTE FUNCTION public.protect_termografia_mobile_children();

CREATE OR REPLACE FUNCTION public.termografia_mobile_capabilities(p_expected_user uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_expected_user THEN RAISE EXCEPTION 'Conta alterada' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('version',1,'maxFileBytes',10485760);
END;
$$;
CREATE OR REPLACE FUNCTION public.prepare_termografia_mobile(p_expected_user uuid,p_organization_id uuid,p_report_id uuid,p_snapshot_hash text,p_snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE r public.relatorios_termografia; d jsonb; p jsonb; manifest jsonb;
BEGIN
  PERFORM public.assert_termografia_mobile_user(p_expected_user,p_organization_id);
  -- Advisory lock also serializes retries before the report row exists.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_report_id::text,0));
  SELECT * INTO r FROM public.relatorios_termografia WHERE organization_id=p_organization_id AND id=p_report_id FOR UPDATE;
  IF FOUND THEN
    IF r.mobile_snapshot_hash IS DISTINCT FROM p_snapshot_hash OR public.termografia_mobile_reconstructed_snapshot(r) IS DISTINCT FROM p_snapshot THEN RAISE EXCEPTION 'ID utilizado para outro snapshot'; END IF;
    RETURN jsonb_build_object('id',r.id,'snapshot_hash',r.mobile_snapshot_hash,'sync_state',r.mobile_sync_state);
  END IF;
  PERFORM public.validate_termografia_mobile_snapshot(p_snapshot,p_report_id); d:=p_snapshot->'report';
  manifest:=jsonb_build_object('version',1,'reportDigest',encode(sha256(convert_to(d::text,'UTF8')),'hex'),'pointDigests',(SELECT jsonb_agg(jsonb_build_object('id',value->>'id','digest',encode(sha256(convert_to(value::text,'UTF8')),'hex'))) FROM jsonb_array_elements(p_snapshot->'points')),'files',p_snapshot->'files');
  INSERT INTO public.relatorios_termografia(id,organization_id,cliente_nome,data_execucao,cliente_cnpj,cliente_endereco,cliente_cidade,cliente_uf,cliente_cep,objetivo,equipamento,responsavel_nome,responsavel_crea,revisao,status,mobile_sync_state,mobile_snapshot_hash,mobile_snapshot,parent_report_id)
    VALUES(p_report_id,p_organization_id,d->>'cliente_nome',(d->>'data_execucao')::date,d->>'cliente_cnpj',d->>'cliente_endereco',d->>'cliente_cidade',d->>'cliente_uf',d->>'cliente_cep',d->>'objetivo',d->>'equipamento',d->>'responsavel_nome',d->>'responsavel_crea',(d->>'revisao')::integer,d->>'status','pending',p_snapshot_hash,manifest,(p_snapshot->>'sourceReportId')::uuid) RETURNING * INTO r;
  FOR p IN SELECT value FROM jsonb_array_elements(p_snapshot->'points') LOOP
    INSERT INTO public.termografia_pontos(id,organization_id,report_id,ordem,setor,local,equipamento,inspecionado,ocorrencia,metadados_coleta)
    VALUES((p->>'id')::uuid,p_organization_id,p_report_id,(p->>'ordem')::integer,p->>'setor',p->>'local',p->>'equipamento',p->'metadata'->>'inspectionStatus'='inspected',jsonb_array_length(p->'metadata'->'hotspots')>0,p->'metadata');
  END LOOP;
  RETURN jsonb_build_object('id',r.id,'snapshot_hash',r.mobile_snapshot_hash,'sync_state',r.mobile_sync_state);
END;
$$;
CREATE OR REPLACE FUNCTION public.append_termografia_mobile_photo(p_expected_user uuid,p_organization_id uuid,p_report_id uuid,p_snapshot_hash text,p_file_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE r public.relatorios_termografia; f jsonb; saved public.termografia_arquivos; object_size bigint;
BEGIN
  PERFORM public.assert_termografia_mobile_user(p_expected_user,p_organization_id);
  SELECT * INTO r FROM public.relatorios_termografia WHERE organization_id=p_organization_id AND id=p_report_id FOR UPDATE;
  IF NOT FOUND OR r.mobile_snapshot_hash IS DISTINCT FROM p_snapshot_hash THEN RAISE EXCEPTION 'Snapshot não encontrado'; END IF;
  SELECT value INTO f FROM jsonb_array_elements(r.mobile_snapshot->'files') WHERE value->>'id'=p_file_id::text;
  IF f IS NULL OR f->>'storagePath' IS DISTINCT FROM (p_organization_id::text||'/'||p_report_id::text||'/'||(f->>'pointId')||'/'||(f->>'fileName')) THEN RAISE EXCEPTION 'Arquivo fora do snapshot/path canônico'; END IF;
  SELECT * INTO saved FROM public.termografia_arquivos WHERE organization_id=p_organization_id AND report_id=p_report_id AND id=p_file_id;
  IF NOT FOUND THEN
    IF r.mobile_sync_state<>'pending' THEN RAISE EXCEPTION 'Coleta finalizada não aceita novas fotos'; END IF;
    INSERT INTO public.termografia_arquivos(id,organization_id,report_id,point_id,tipo,storage_path,file_name,content_type,tamanho_bytes,content_sha256,image_width,image_height)
    VALUES(p_file_id,p_organization_id,p_report_id,(f->>'pointId')::uuid,f->>'kind',f->>'storagePath',f->>'fileName',f->>'contentType',(f->>'size')::bigint,f->>'sha256',(f->>'width')::integer,(f->>'height')::integer) RETURNING * INTO saved;
  END IF;
  -- Registered metadata makes this canonical object visible under existing Storage SELECT RLS.
  SELECT (metadata->>'size')::bigint INTO object_size FROM storage.objects WHERE bucket_id='termografia-docs' AND name=saved.storage_path;
  IF NOT FOUND OR (object_size IS NOT NULL AND object_size<>saved.tamanho_bytes) THEN RAISE EXCEPTION 'Upload da foto não foi confirmado'; END IF;
  RETURN to_jsonb(saved);
END;
$$;
CREATE OR REPLACE FUNCTION public.finalize_termografia_mobile(p_expected_user uuid,p_organization_id uuid,p_report_id uuid,p_snapshot_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE r public.relatorios_termografia;
BEGIN
  PERFORM public.assert_termografia_mobile_user(p_expected_user,p_organization_id);
  SELECT * INTO r FROM public.relatorios_termografia WHERE organization_id=p_organization_id AND id=p_report_id FOR UPDATE;
  IF NOT FOUND OR r.mobile_snapshot_hash IS DISTINCT FROM p_snapshot_hash THEN RAISE EXCEPTION 'Snapshot não encontrado'; END IF;
  PERFORM public.check_termografia_mobile_complete(r);
  IF r.mobile_sync_state='pending' THEN UPDATE public.relatorios_termografia SET mobile_sync_state='complete' WHERE organization_id=p_organization_id AND id=p_report_id RETURNING * INTO r; END IF;
  RETURN jsonb_build_object('id',r.id,'snapshot_hash',r.mobile_snapshot_hash,'sync_state',r.mobile_sync_state);
END;
$$;

-- Locking the point serializes legacy replacement after removing the old uniqueness constraint.
CREATE OR REPLACE FUNCTION public.save_termografia_photo(p_organization_id uuid,p_report_id uuid,p_point_id uuid,p_file_id uuid,p_tipo text,p_file_name text,p_content_type text,p_tamanho_bytes bigint,p_previous_file_id uuid DEFAULT NULL)
RETURNS SETOF public.termografia_arquivos LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE current_file public.termografia_arquivos; saved public.termografia_arquivos; v_path text; metadata jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.is_organization_member(p_organization_id),false) THEN RAISE EXCEPTION 'Sem acesso à organização' USING ERRCODE='42501'; END IF;
  SELECT metadados_coleta INTO metadata FROM public.termografia_pontos WHERE organization_id=p_organization_id AND report_id=p_report_id AND id=p_point_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quadro não encontrado'; END IF;
  IF metadata IS NOT NULL OR EXISTS(SELECT 1 FROM public.relatorios_termografia WHERE organization_id=p_organization_id AND id=p_report_id AND mobile_sync_state IS NOT NULL) THEN RAISE EXCEPTION 'Coleta móvel exige nova revisão; substituição legada bloqueada'; END IF;
  IF (SELECT count(*) FROM public.termografia_arquivos WHERE organization_id=p_organization_id AND report_id=p_report_id AND point_id=p_point_id AND tipo=p_tipo)>1 THEN RAISE EXCEPTION 'Múltiplos arquivos existentes; substituição ambígua bloqueada'; END IF;
  SELECT * INTO current_file FROM public.termografia_arquivos WHERE organization_id=p_organization_id AND report_id=p_report_id AND point_id=p_point_id AND tipo=p_tipo FOR UPDATE;
  v_path:=p_organization_id::text||'/'||p_report_id::text||'/'||p_point_id::text||'/'||p_file_name;
  IF current_file.id=p_file_id THEN
    IF current_file.storage_path IS DISTINCT FROM v_path OR current_file.content_type IS DISTINCT FROM p_content_type OR current_file.tamanho_bytes IS DISTINCT FROM p_tamanho_bytes THEN RAISE EXCEPTION 'ID utilizado para outra foto'; END IF;
    saved:=current_file;
  ELSE
    IF current_file.id IS DISTINCT FROM p_previous_file_id THEN RAISE EXCEPTION 'Foto alterada em outra sessão'; END IF;
    IF current_file.id IS NOT NULL THEN DELETE FROM public.termografia_arquivos WHERE id=current_file.id AND organization_id=p_organization_id; END IF;
    INSERT INTO public.termografia_arquivos(id,organization_id,report_id,point_id,tipo,storage_path,file_name,content_type,tamanho_bytes)
    VALUES(p_file_id,p_organization_id,p_report_id,p_point_id,p_tipo,v_path,p_file_name,p_content_type,p_tamanho_bytes) RETURNING * INTO saved;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='termografia-docs' AND name=v_path) THEN RAISE EXCEPTION 'Upload da foto não confirmado'; END IF;
  RETURN NEXT saved;
END;
$$;

-- Restrictive policies cannot grant access; existing membership/path policies remain required.
CREATE POLICY "Termografia mobile objects cannot be deleted" ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING (
  bucket_id<>'termografia-docs' OR NOT EXISTS(SELECT 1 FROM public.relatorios_termografia r WHERE r.organization_id::text=(storage.foldername(name))[1] AND r.id::text=(storage.foldername(name))[2] AND r.mobile_sync_state IS NOT NULL)
);
CREATE POLICY "Termografia completed mobile objects cannot be inserted" ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (
  bucket_id<>'termografia-docs' OR NOT EXISTS(SELECT 1 FROM public.relatorios_termografia r WHERE r.organization_id::text=(storage.foldername(name))[1] AND r.id::text=(storage.foldername(name))[2] AND r.mobile_sync_state='complete')
);
CREATE POLICY "Termografia mobile objects cannot be updated" ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING (
  bucket_id<>'termografia-docs' OR NOT EXISTS(SELECT 1 FROM public.relatorios_termografia r WHERE r.organization_id::text=(storage.foldername(name))[1] AND r.id::text=(storage.foldername(name))[2] AND r.mobile_sync_state IS NOT NULL)
) WITH CHECK (
  bucket_id<>'termografia-docs' OR NOT EXISTS(SELECT 1 FROM public.relatorios_termografia r WHERE r.organization_id::text=(storage.foldername(name))[1] AND r.id::text=(storage.foldername(name))[2] AND r.mobile_sync_state IS NOT NULL)
);

REVOKE ALL ON FUNCTION public.validate_termografia_mobile_snapshot(jsonb,uuid), public.assert_termografia_mobile_user(uuid,uuid), public.termografia_mobile_report_data(public.relatorios_termografia), public.termografia_mobile_reconstructed_snapshot(public.relatorios_termografia), public.check_termografia_mobile_complete(public.relatorios_termografia), public.protect_termografia_mobile_report(), public.protect_termografia_mobile_children(), public.termografia_mobile_capabilities(uuid), public.prepare_termografia_mobile(uuid,uuid,uuid,text,jsonb), public.append_termografia_mobile_photo(uuid,uuid,uuid,text,uuid), public.finalize_termografia_mobile(uuid,uuid,uuid,text), public.save_termografia_photo(uuid,uuid,uuid,uuid,text,text,text,bigint,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.validate_termografia_mobile_snapshot(jsonb,uuid), public.assert_termografia_mobile_user(uuid,uuid), public.termografia_mobile_report_data(public.relatorios_termografia), public.termografia_mobile_reconstructed_snapshot(public.relatorios_termografia), public.check_termografia_mobile_complete(public.relatorios_termografia), public.protect_termografia_mobile_report(), public.protect_termografia_mobile_children(), public.termografia_mobile_capabilities(uuid), public.prepare_termografia_mobile(uuid,uuid,uuid,text,jsonb), public.append_termografia_mobile_photo(uuid,uuid,uuid,text,uuid), public.finalize_termografia_mobile(uuid,uuid,uuid,text), public.save_termografia_photo(uuid,uuid,uuid,uuid,text,text,text,bigint,uuid) TO authenticated;
COMMIT;
