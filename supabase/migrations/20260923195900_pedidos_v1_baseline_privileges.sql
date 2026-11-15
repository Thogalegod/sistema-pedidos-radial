-- M00 / Gate 0.5: preserve the existing CRUD grants and RLS policies.
-- TRUNCATE bypasses row-level security; the current app does not use it.
REVOKE TRUNCATE ON TABLE
  public.pedidos,
  public.tarefas,
  public.subtarefas,
  public.comentarios_tarefa,
  public.atividades,
  public.anexos
FROM authenticated;
