# Pedidos/Tarefas Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Criar, sem aplicar, duas migrations locais seguras para incorporar Pedidos/Tarefas ao MISFY e adaptar apenas o necessário no frontend para organização e Storage privado.

**Architecture:** As seis tabelas legadas serão recriadas no schema `public` com `organization_id` obrigatório, FKs compostas por organização e referências opcionais ao cadastro MISFY/Auth. O acesso será restrito a `authenticated` e validado por `public.is_organization_member`. Os binários ficarão em bucket privado; `public.anexos` guardará apenas `storage_path`, e o cliente criará signed URLs temporárias.

**Tech Stack:** PostgreSQL/Supabase migrations, Supabase Storage/RLS, Next.js 16.2.4 App Router, React 19, TypeScript, Vitest.

**Global Constraints:** Não aplicar migration; não executar `db push`, reset ou repair; não tocar em banco remoto; não usar `service_role`; não alterar Auth, `.env`, relatórios ou migrations já aplicadas; não fazer commit, push ou deploy. Manter `tarefas.prazo` nullable/depreciada e sem uso novo.

---

## Task 1: Fixar contratos de segurança e compatibilidade em testes

**Files:**
- Create: `src/lib/pedidos-tarefas/migration-consistency.test.ts`

- [ ] Escrever testes que localizem exatamente uma migration de core e uma de Storage posteriores a `202607081700`.
- [ ] Exigir as seis tabelas, `organization_id`, constraints únicas `(organization_id, id)` e FKs compostas entre pedidos/tarefas/subtarefas/comentários/atividades/anexos.
- [ ] Exigir FKs opcionais de `pedidos` para `customers`, `customer_sites` e `customer_contacts` na mesma organização.
- [ ] Exigir os checks legados exatos de status e prioridade, além de `tarefas.prazo timestamptz` nullable e comentário de depreciação.
- [ ] Exigir RLS em todas as tabelas, policies por operação usando `public.is_organization_member`, revogação de `anon`/`PUBLIC` e grants mínimos por tabela.
- [ ] Rejeitar `service_role`, grants/policies para `anon`, `USING (true)`, `WITH CHECK (true)` e qualquer referência ao project ref do IURQ.
- [ ] Exigir bucket privado `anexos-pedidos`, limite de 10 MiB, caminho com exatamente dois diretórios e policies Storage de SELECT/INSERT/DELETE ligadas a pedido + membership.
- [ ] Rodar `npm test -- src/lib/pedidos-tarefas/migration-consistency.test.ts` e confirmar falha porque as migrations ainda não existem.

## Task 2: Criar migration de schema, relações, grants e RLS

**Files:**
- Create: `supabase/migrations/202607211100_pedidos_tarefas_core.sql`

- [ ] Criar `pedidos`, `tarefas`, `subtarefas`, `comentarios_tarefa`, `atividades` e `anexos` preservando nomes, tipos, nulabilidade, defaults e checks funcionais inventariados.
- [ ] Adicionar `organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE` e `UNIQUE (organization_id, id)` às seis tabelas.
- [ ] Adicionar a `pedidos` os campos opcionais `customer_id`, `site_id`, `contact_id` e `created_by`; manter `cliente`, `endereco` e `cep`.
- [ ] Adicionar referências Auth opcionais: `tarefas.responsavel_user_id`, `tarefas.created_by`, `subtarefas.created_by`, `comentarios_tarefa.user_id`, `atividades.user_id`, `anexos.created_by`, todas com `ON DELETE SET NULL`.
- [ ] Manter `responsavel` e `usuario` como texto; manter `tarefas.prazo` nullable e documentá-la como depreciada.
- [ ] Definir as FKs filhas com `(organization_id, ..._id)` para impedir relações entre organizações.
- [ ] Criar apenas índices úteis para filtros/joins por organização, status, prioridade, prazo e pais.
- [ ] Habilitar RLS e criar policies separadas por operação, somente `TO authenticated`, sempre com membership e sem expressões universais.
- [ ] Revogar privilégios de `PUBLIC` e `anon`; conceder CRUD só onde o frontend atual usa cada operação.
- [ ] Rodar o teste focal e ajustar somente a migration/teste se houver divergência real do contrato aprovado.

## Task 3: Criar migration do bucket privado e anexos

**Files:**
- Create: `supabase/migrations/202607211130_pedidos_anexos_storage.sql`

- [ ] Criar/atualizar o bucket `anexos-pedidos` com `public = false`, limite de 10 MiB e MIME types de imagem/PDF usados pela UI.
- [ ] Criar policy SELECT para membros da organização quando o caminho tiver exatamente `<organization_id>/<pedido_id>/<arquivo>` e o pedido existir na mesma organização.
- [ ] Criar policy INSERT com a mesma validação de membership, pedido e estrutura de caminho.
- [ ] Criar policy DELETE para membros da organização removerem somente uploads sem linha de metadados, mantendo a validação exata de pedido e caminho.
- [ ] Não conceder privilégios diretos em `storage.objects` e não criar policy UPDATE.
- [ ] Rodar o teste focal até passar.

## Task 4: Adaptar o frontend ao escopo de organização

**Files:**
- Create: `src/lib/pedidos-tarefas/organization.ts`
- Create: `src/lib/pedidos-tarefas/organization.test.ts`
- Modify: `src/app/page.tsx`

- [ ] Testar um helper que resolve exatamente uma organização atual por membership e produz erro claro quando não há associação.
- [ ] Reutilizar o padrão MISFY de consulta `organization_members.select('organization_id').limit(1).single()`.
- [ ] Carregar `organization_id` antes dos pedidos e filtrar a consulta raiz por organização.
- [ ] Acrescentar `organization_id` a todos os inserts das seis tabelas e escopar updates/deletes por organização.
- [ ] Não usar `tarefas.prazo` em código novo e não introduzir dependência de `perfis`.

## Task 5: Adaptar anexos a Storage privado

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/components/OrderDrawer.tsx`

- [ ] Trocar `Anexo.url` por `storage_path` e `signed_url` efêmera.
- [ ] Ao carregar pedidos, criar signed URLs com expiração curta para cada `storage_path` sem persistir a URL.
- [ ] Fazer upload em `<organization_id>/<pedido_id>/<arquivo>` e inserir `storage_path` + `organization_id` nos metadados.
- [ ] Se o insert de metadados falhar, remover o upload órfão imediatamente.
- [ ] Na exclusão, capturar e preservar o `storage_path`, apagar primeiro a linha `public.anexos` e somente depois remover o objeto pelo caminho preservado, para compatibilidade com a policy de órfão.
- [ ] Se a exclusão do metadado falhar, não tentar remover o objeto; se a exclusão do Storage falhar depois do metadado, informar claramente que pode ter restado um objeto órfão.
- [ ] No sucesso, confirmar que metadado e objeto foram removidos.
- [ ] Ao excluir um pedido, remover em ordem os metadados dos anexos, os objetos privados e só então o pedido; abortar a exclusão se a limpeza falhar.
- [ ] Renderizar link/preview apenas quando houver `signed_url`; não chamar `getPublicUrl`.

## Task 6: Verificar implementação e preservar isolamento

**Files:**
- Verify only: entire scoped diff

- [ ] Rodar `npm test -- src/lib/pedidos-tarefas`.
- [ ] Rodar `npm test` para regressão focal do repositório.
- [ ] Rodar `npm run lint` e `npx tsc --noEmit`.
- [ ] Rodar busca proibitiva por `service_role`, project ref IURQ, `USING (true)`, `WITH CHECK (true)`, `getPublicUrl` e grants a `anon` nos arquivos novos/alterados.
- [ ] Conferir `git diff --check`, `git status --short`, branch/HEAD e ausência de alterações no worktree principal.
- [ ] Revisar o SQL integral e o diff sem aplicar migration, commitar, fazer push ou deploy.
