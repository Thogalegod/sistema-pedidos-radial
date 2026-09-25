# Relatórios de Cabine Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar duas migrations locais seguras para Relatórios de Cabine no MISFY e adaptar o frontend somente ao escopo organizacional e Storage privado.

**Architecture:** Uma única tabela preserva o snapshot histórico e recebe referências opcionais ao cadastro central. A ART é representada por `art_storage_path` nullable no relatório; o bucket privado usa path organizacional, signed URLs e compensações explícitas para falhas parciais.

**Tech Stack:** PostgreSQL/Supabase migrations, Supabase Storage/RLS, Next.js 16.2.4 App Router, React 19, TypeScript e Vitest.

## Global Constraints

Não aplicar migrations; não executar `db push`, reset ou repair; não alterar `.env`; não usar `service_role`; não tocar em Termografia ou Transformadores; não rodar a suíte geral; não fazer commit, push ou deploy.

---

### Task 1: Fixar o contrato das migrations

**Files:**
- Create: `src/lib/cabine/migration-consistency.test.ts`

- [ ] Escrever testes que exijam duas migrations posteriores a `202607211130`, tabela única, `organization_id`, uniques organizacionais, índice parcial de `legacy_id`, `art_storage_path` nullable, FKs compostas, status e grants/RLS mínimos.
- [ ] Exigir bucket privado de 10 MiB, somente PDF, path organizacional, signed-url-compatible policies e DELETE com `NOT EXISTS` no path.
- [ ] Rejeitar `anon`, `service_role`, `USING (true)`, `WITH CHECK (true)`, project ref IURQ e alterações de Termografia.
- [ ] Rodar `npm test -- src/lib/cabine/migration-consistency.test.ts` e confirmar falha pela ausência das migrations.

### Task 2: Criar as migrations locais

**Files:**
- Create: `supabase/migrations/202607211200_relatorios_cabine_core.sql`
- Create: `supabase/migrations/202607211230_relatorios_cabine_storage.sql`

- [ ] Criar o schema preservando campos históricos e adicionando organização/cadastro central.
- [ ] Criar índices, grants e policies por membership.
- [ ] Criar bucket e policies SELECT/INSERT/DELETE com o contrato aprovado.
- [ ] Rodar novamente o teste focal e obter verde.

### Task 3: Implementar helpers de documentos por TDD

**Files:**
- Create: `src/lib/cabine/documents.test.ts`
- Create: `src/lib/cabine/documents.ts`

- [ ] Testar path organizacional, signed URL, upload seguido de vínculo, compensação do upload e mensagens de possível órfão.
- [ ] Testar exclusão banco→Storage, bloqueio do Storage quando o banco falha e erro explícito quando o Storage falha após o banco.
- [ ] Rodar o teste para observar falha antes da implementação.
- [ ] Implementar o mínimo e rodar o teste até passar.

### Task 4: Adaptar o frontend de Cabine

**Files:**
- Modify: `src/lib/cabine-calc.ts`
- Modify: `src/app/cabine/actions.ts`
- Modify: `src/app/cabine/nova/page.tsx`
- Modify: `src/app/cabine/page.tsx`
- Modify: `src/app/cabine/[id]/imprimir/page.tsx`

- [ ] Resolver a organização autenticada, inserir/filtrar `organization_id` e trocar o campo da ART.
- [ ] Criar relatório antes do upload, vincular o path e executar compensação em falha.
- [ ] Preservar o path antes da exclusão, remover banco antes do Storage e propagar erro de órfão.
- [ ] Usar signed URLs e não persistir URL pública.
- [ ] Rodar testes focais e TypeScript.

### Task 5: Verificação final

**Files:**
- Verify only: scoped diff

- [ ] Rodar `npm test -- src/lib/cabine`.
- [ ] Rodar `npx tsc --noEmit --incremental false` porque houve alteração TypeScript.
- [ ] Rodar buscas proibitivas e `git diff --check`.
- [ ] Revisar o SQL integral, branch/HEAD, status dos dois worktrees e ausência de commit/push/deploy.
