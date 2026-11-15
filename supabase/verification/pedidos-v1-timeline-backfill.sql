-- Read-only post-M13 verification without exposing note contents.
SELECT jsonb_pretty(jsonb_build_object(
  'legacy_comments',(SELECT count(*) FROM public.comentarios_tarefa),
  'projected_comments',(SELECT count(*) FROM public.atividades WHERE source_comment_id IS NOT NULL),
  'missing_projections',(SELECT count(*) FROM public.comentarios_tarefa c LEFT JOIN public.atividades a
    ON a.organization_id=c.organization_id AND a.source_comment_id=c.id WHERE a.id IS NULL),
  'content_mismatches',(SELECT count(*) FROM public.comentarios_tarefa c JOIN public.atividades a
    ON a.organization_id=c.organization_id AND a.source_comment_id=c.id
    WHERE (a.descricao,a.usuario,a.user_id,a.criado_em) IS DISTINCT FROM (c.texto,c.usuario,c.user_id,c.criado_em)),
  'relationship_mismatches',(SELECT count(*) FROM public.comentarios_tarefa c
    JOIN public.tarefas t ON t.organization_id=c.organization_id AND t.id=c.tarefa_id
    JOIN public.atividades a ON a.organization_id=c.organization_id AND a.source_comment_id=c.id
    WHERE (a.pedido_id,a.tarefa_id) IS DISTINCT FROM (t.pedido_id,c.tarefa_id)),
  'legacy_comments_without_user_id',(SELECT count(*) FROM public.comentarios_tarefa WHERE user_id IS NULL),
  'projected_comments_without_user_id',(SELECT count(*) FROM public.atividades
    WHERE source_comment_id IS NOT NULL AND user_id IS NULL),
  'legacy_standalone_comments',(SELECT count(*) FROM public.comentarios_tarefa c
    JOIN public.tarefas t ON t.organization_id=c.organization_id AND t.id=c.tarefa_id
    WHERE t.pedido_id IS NULL),
  'projected_standalone_comments',(SELECT count(*) FROM public.atividades a
    JOIN public.tarefas t ON t.organization_id=a.organization_id AND t.id=a.tarefa_id
    WHERE a.source_comment_id IS NOT NULL AND t.pedido_id IS NULL),
  'unrecoverable_comments',(SELECT count(*) FROM public.comentarios_tarefa c LEFT JOIN public.tarefas t
    ON t.organization_id=c.organization_id AND t.id=c.tarefa_id WHERE t.id IS NULL),
  'projection_key_hash',(SELECT md5(coalesce(string_agg(organization_id::text||':'||source_comment_id::text,','
    ORDER BY organization_id,source_comment_id),'')) FROM public.atividades WHERE source_comment_id IS NOT NULL)
)) AS pedidos_v1_timeline_backfill_verification;
