-- Pending backend compatibility patch. Not applied. Apply before publishing the digitalPhotoId client.
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
        OR (h ? 'digitalPhotoId' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s->'files') x WHERE x->>'id'=h->>'digitalPhotoId' AND x->>'pointId'=p->>'id' AND x->>'kind'='digital'))
        OR (h ? 'descricao' AND jsonb_typeof(h->'descricao') IS DISTINCT FROM 'string')
        OR (h ? 'classificacao' AND h->>'classificacao' NOT IN ('Normal','Observação','Intervenção Programada','Intervenção Imediata','Crítico'))
        OR (h ? 'risco' AND h->>'risco' NOT IN ('Baixo','Médio','Alto'))
        OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s->'files') x WHERE x->>'id'=h->>'photoId' AND x->>'pointId'=p->>'id' AND x->>'kind'='termica')
        OR EXISTS(SELECT 1 FROM jsonb_object_keys(h) k WHERE k NOT IN ('id','photoId','digitalPhotoId','componente','temperatura','conclusao','descricao','classificacao','risco')) THEN
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
