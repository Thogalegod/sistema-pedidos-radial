# Controle de Pedidos + Tarefas V1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evoluir o Controle de Pedidos existente para a V1 aprovada, com aplicativo funcional e revisão humana ao fim de cada gate.

**Architecture:** Reutilizar Pedidos, tarefas, subtarefas, atividades, anexos, rotas e organização existentes. Introduzir contratos focados e migrations incrementais com sequência expandir → compatibilizar → preencher → trocar a fonte canônica → restringir. Regras derivadas são funções puras; operações que exigem atomicidade ou segurança concorrente são transações no banco.

**Tech Stack:** Next.js 16.2.4/App Router, React 19.2.4, TypeScript 5, Supabase/Postgres, Zod 4, date-fns 4, Tailwind, Vitest 4, Testing Library e pgTAP; sem nova biblioteca obrigatória.

**Spec:** `docs/superpowers/specs/2026-09-23-controle-pedidos-tarefas-v1-design.md`, aprovada e registrada em `e70d116a2f2fbdac0b22965665841631fab368ee`.

**Estado:** master roadmap aprovado, com esta revisão do plano submetida à revisão humana antes da execução Native. O Gate 0.5 e os gates humanos previstos continuam pré-condições. Este documento não autoriza executar uma migration, alterar banco ou fazer commit/push/deploy por conta própria.

## Global Constraints

- **Evoluir o Controle de Pedidos existente por camadas.** Não criar sistema paralelo nem reescrever o módulo do zero.
- Preservar Pedidos, tarefas, subtarefas, anexos, atividades, organização/tenant, RLS, navegação e fluxos úteis; uma fonte canônica por conceito em cada fase.
- Seis lotes, nesta ordem: Fundação; Tela do Pedido; Dashboard; Templates; Timeline e Arquivos; Eventos e Calendário.
- Pedido: **Em andamento**, **Finalizado**, **Cancelado**. Finalizar, cancelar e reabrir são ações humanas explícitas. Pedido vazio não tem progresso de 100%.
- Tarefa: **Aberta**, **Em andamento**, **Aguardando**, **Concluída**. Prioridade: **Urgente**, **Alta**, **Normal**, **Baixa**, padrão Normal. Indicadores não alteram status/prioridade.
- Espera: **Cliente**, **Concessionária**, **Fornecedor**, **Pessoa interna**, **Outro**. Pessoa interna referencia membro real da mesma organização; nomes de funcionários não são categorias de schema.
- Tarefa do Pedido usa criador autenticado como responsável padrão; avulsa usa Thomás somente quando resolvido inequivocamente na organização, senão exige seleção.
- Avulsa usa `tarefas`, com `pedido_id` e `frente_id` nulos. Vinculá-la posteriormente a Pedido fica fora da V1.
- D+n usa dias corridos e data local. Primeira conclusão materializa regra pendente uma vez; alteração manual prevalece.
- Calendário global e do Pedido usam as mesmas fontes, sem tabela de cópias. Upload sempre pertence a Pedido.
- `tarefas.vencimento` é o prazo. Não escrever em `tarefas.prazo`; preservar prioridade e prazo da concessionária do Pedido como dados legados.
- Toda tabela nova da V1 em `public` (`pedido_frentes`, `tarefa_dependencias`, `pedido_templates`, `pedido_eventos`) deve executar, após CREATE e antes de GRANT, `REVOKE ALL` separadamente de PUBLIC, anon e authenticated; só depois receber GRANT explícito e mínimo. Nunca confiar nos default privileges do schema `public`. A tabela técnica nova `private.pedidos_v1_rollout` também revoga os três papéis e não recebe grants de anon/authenticated. Cada teste de tabela nova verifica privilégios **efetivos**, inclusive ausência de TRUNCATE de authenticated e nenhuma ampliação de anon.
- `organization_members.display_name`, se necessário após inspeção focal, é somente apresentação por organização; identidade, filtros, ownership e espera interna usam `user_id`. E-mail nunca é identidade de negócio nem atalho para deduzir nomes.
- Não implementar Kanban, drag-and-drop, integrações, notificações externas, IA, SLA, métricas, campos genéricos, dependências entre Pedidos, salvar Pedido como template ou automações gerais.
- IURQ `iurqgskfuupslrghgtej` é o único destino remoto previsto. MISFY `misfyiznwnuvldoccciw` nunca é alvo implícito. Não ler/expor secrets.
- Worktree atual `C:\tmp\Sistema_Pedidos_Radial-unificar-transformador`, branch `codex/controle-locacoes`; uma feature por worktree. Preservar os untracked existentes.
- Gate humano antes de aplicar cada migration; **PRONTO PARA TESTE MANUAL** antes de avançar cada sublote. Commit sugerido só após autorização, staging seletivo e `npm run ai:gate:staged`. Push/merge/deploy exigem autorização separada.

## Review Focus

1. Dados antigos sem usuário resolvido, timestamp ou pai válido: não inventar identidade/data nem apagar registros; inventariar, preservar texto legado e impedir restrição até resolver os casos inválidos — inspeção focal e testes 1A.2, 1B.2, 1B.3, 5B.
2. Duas requisições concorrentes criando Geral, ciclo A→B/B→A, ou adicionando tarefa enquanto finaliza Pedido: atomicidade e serialização por Pedido, sem órfãos — testes 1A.1, 1A.3, 1C.1.
3. Virada de mês, ano, fuso e reabertura após prazo manual: datas civis estáveis e materialização uma única vez — testes 2A, 4A, 4C, 6B.
4. IDs válidos de outra organização ou de outro Pedido da mesma organização: negar vínculo mesmo por chamada direta, inclusive usuário interno e anexo de atualização — testes 1A.1–3, 3A, 4B, 5C, 6A.
5. Cliente antigo aberto durante transição e repetição de backfill/requisição: nenhuma perda/duplicação ou dupla fonte de status/notas; leituras financeiras da Central preservadas — testes 1B.1, 1C.2, 3B, 4B, 5A–C.

---

## 0. Execução, verificações e contratos comuns

### 0.1 Base real e sequência

Base inicial: HEAD conferido no commit da spec. **Gate 0 READ-ONLY concluído em 24/09/2026**, somente no IURQ `iurqgskfuupslrghgtej`: 30 migrations locais e 30 remotas correspondem em nome/versão, inclusive `20260923191720_internal_billing_notes_invoice_visibility.sql`. Há 1 Pedido, 4 tarefas, 2 subtarefas e 2 membros na organização encontrada; as 4 tarefas têm responsável em texto, nenhum `responsavel_user_id`; nenhum dos 2 membros tinha nome de apresentação confiável nos campos de metadata examinados. Não repetir o Gate 0 como parte de 0.5; conferir identidade e pendências antes de cada aplicação futura conforme 0.2.

Pontos concretos: `src/app/page.tsx` concentra consultas e writes; `OrderDrawer.tsx` concentra detalhe; `StatusBadge.tsx`, `sorting.ts`, `NewOrderDrawer.tsx`, mocks e Central ainda dependem dos status antigos. `organization_members` tem PK `(organization_id,user_id)`, mas membros comuns só leem a própria associação. Não há diretório público de perfis já disponível. `anexos` e storage têm proteções de remoção que devem permanecer.

São **6 lotes e 25 gates de execução**: Gate 0.5 isolado + 9 gates na Fundação + 3 + 2 + 3 + 4 + 3 nos Lotes 2–6. O Gate 0 já concluído não entra nessa contagem. A ordem listada é obrigatória. A inspeção focal de nomes é pré-condição read-only de 1A.2, sem repetir o inventário agregado do Gate 0; o Gate 1B.3 certifica prontidão nominal. Subpassos com checkbox são ações dentro do gate, não autorização para atravessar o próximo.

### 0.2 Protocolo de teste e gate, aplicável a todas as tarefas

1. Antes da execução futura, ler spec, este plano, AGENTS e skills `radial-fast-development`, `radial-safety`, `superpowers:test-driven-development`, `superpowers:verification-before-completion`; usar `superpowers:executing-plans` na execução Native aprovada. Ler a documentação local de Next em `node_modules/next/dist/docs/` antes de código de rota/componente. Consultar skill Supabase e ajuda da CLI antes de comandos de banco.
2. RED significa executar o teste novo contra o comportamento anterior e observar falha na regra esperada, não falha de conexão/configuração. Escrever asserts comportamentais; teste que só procura palavras na migration não prova integridade/RLS.
3. GREEN repete o mesmo comando RED após a implementação e executa os casos da matriz da tarefa. Para TypeScript/TSX: `rtk proxy npx tsc --noEmit`; para lint, usar o comando focal abaixo, que só seleciona os caminhos existentes do módulo e seus consumidores conhecidos. Para SQL puro, TypeScript/lint não se aplicam; rodar pgTAP e diff check.
4. Comandos nos blocos são para execução futura. RTK é preferencial; se estiver indisponível/bloqueado, executar o mesmo comando sem `rtk`/`proxy`, registrando o motivo. Nesta inspeção o binário RTK retornou acesso negado.
5. Banco RED/GREEN: usar Supabase **local descartável**, sem reset de IURQ. Primeiro `rtk proxy supabase test db --help` e `rtk proxy supabase migration --help`. Os comandos `supabase test db supabase/tests/database/arquivo.sql` abaixo são locais. Preparar o teste no estado predecessor; aplicar só a migration da tarefa localmente; repetir o teste. Registrar se o runtime local estiver indisponível e não declarar teste executado.
6. Depois de GREEN: inventário/dry-run do IURQ com identidade confirmada, lista exata de migrations pendentes, SQL de verificação e recuperação revisados. Qualquer migration alheia pendente bloqueia aplicação em lote. Pedir autorização humana **por conjunto explícito** antes da aplicação remota. Não embutir URL com credencial no plano ou no log.
7. Fazer QA no IURQ, apresentar **PRONTO PARA TESTE MANUAL**, evidências e limites, aguardar aprovação. O usuário inicia servidor Next no Windows. Não avançar ao próximo gate enquanto o anterior estiver reprovado. Gate somente de biblioteca mantém UI vigente e testa a regra pelo harness local e leitura de dados no IURQ.
8. Commit sugerido é condicional: `git status`, `git add --` com somente arquivos da tarefa, `git diff --cached --check`, revisão staged e `rtk npm run ai:gate:staged`; commit com a mensagem indicada apenas após autorização. Nenhuma tarefa inclui push.

Comando de lint aplicável aos gates TS/TSX (PowerShell; não executar nesta etapa de planejamento):

```powershell
$pedidosLintPaths = @(
  'src/lib/pedidos-tarefas','src/components/pedidos-tarefas','src/lib/central',
  'src/app/page.tsx','src/app/hub/page.tsx','src/app/calendario/page.tsx',
  'src/components/OrderDrawer.tsx','src/components/NewOrderDrawer.tsx',
  'src/components/OrderCard.tsx','src/components/StatusBadge.tsx',
  'src/components/StatusBadge.test.tsx','src/components/OrderDrawer.transitions.test.tsx',
  'src/components/app-shell/navigation.ts','src/components/app-shell/navigation.test.ts',
  'src/lib/sorting.ts','src/lib/sorting.test.ts','src/types/index.ts','src/data/mock.ts'
) | Where-Object { Test-Path -LiteralPath $_ }
& rtk proxy npx eslint @pedidosLintPaths
```

### 0.3 Arquivos, migrations e evidências

Todos os caminhos abaixo são relativos à raiz do worktree. Prefixos usados para reduzir repetição: **D** = `src/lib/pedidos-tarefas`, **UI** = `src/components/pedidos-tarefas`, **DBT** = `supabase/tests/database`. `D/types.ts`, por exemplo, significa exatamente `src/lib/pedidos-tarefas/types.ts`. São caminhos, não novos pacotes.

Migrations propostas, **não criar nesta etapa**. Os nomes exatos ficam reservados neste plano; antes de criar na execução, conferir colisões e ordem contra migrations adicionadas entretanto. Se a CLI atribuir timestamp diferente, registrar a correspondência no plano antes da aplicação, mantendo sufixo e ordem. Nunca editar migration histórica/aplicada.

| ID | Arquivo em `supabase/migrations/` | Gate / efeito |
|---|---|---|
| M00 | `20260923195900_pedidos_v1_baseline_privileges.sql` | 0.5 / retirar TRUNCATE das seis tabelas existentes sem perder CRUD |
| M01 | `20260923200000_pedidos_v1_frentes_expand.sql` | 1A.1 / Frentes e compatibilidade |
| M02 | `20260923200100_pedidos_v1_status_members_expand.sql` | 1A.2 / campos, diretório e, se confirmado pela inspeção focal anterior a 1A.2, display_name canônico no membership |
| M03 | `20260923200200_pedidos_v1_subtasks_dependencies.sql` | 1A.3 / subtarefas e grafo |
| M04 | `20260923200300_pedidos_v1_backfill.sql` | 1B.2 / dados, sem destruição |
| M05 | `20260923200400_pedidos_v1_commands.sql` | 1C.1 / RPCs preparadas |
| M06 | `20260923200500_pedidos_v1_activate.sql` | 1C.2 / fonte canônica |
| M07 | `20260923200600_pedidos_v1_validate.sql` | 1D / restringir após aceite |
| M08 | `20260923200700_pedidos_v1_quick_tasks.sql` | 3A / Pedido opcional |
| M09 | `20260923200800_pedidos_v1_templates_expand.sql` | 4A / blueprint e regras |
| M10 | `20260923200900_pedidos_v1_template_instance.sql` | 4B / transação de instância |
| M11 | `20260923201000_pedidos_v1_relative_dates.sql` | 4C / primeira conclusão |
| M12 | `20260923201100_pedidos_v1_timeline_expand.sql` | 5A / estrutura e captura |
| M13 | `20260923201200_pedidos_v1_timeline_backfill.sql` | 5B / notas legadas |
| M14 | `20260923201300_pedidos_v1_timeline_activate.sql` | 5C / cutover e vínculos |
| M15 | `20260923201400_pedidos_v1_events.sql` | 6A / Eventos |

Total: **16 migrations planejadas** (M00–M15). M00 é anterior a M01 e independente das tabelas novas. Os nomes são propostas, não arquivos criados; a CLI e o estado local/remoto devem ser reconferidos antes da criação futura.

Cada tarefa SQL cria também o arquivo de verificação indicado em `supabase/verification/`; ele contém somente SELECTs e é executável no IURQ após autorização de leitura. Fixtures pgTAP usam `BEGIN`, `CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions`, `SELECT no_plan()`, `SELECT * FROM finish()`, `ROLLBACK`. Criar `supabase/tests/helpers/pedidos-v1-fixtures.sql` em 0.5, incluído por `\ir ../helpers/pedidos-v1-fixtures.sql` nos testes. Ele cria em transação dois tenants sintéticos, dois Pedidos no tenant A, um no B, usuário admin A, membro comum A e membro B em `auth.users`/`organization_members`, sem credenciais. IDs fixos terminados em 001/002/003; nomes e valores completos ficam no helper; testes não dependem de IDs reais do IURQ. As tarefas ampliam o helper apenas com os dados que testam, nunca com acesso remoto.

Para testes concorrentes, criar em 1A.3 `scripts/tests/pedidos-concurrency.mjs`: duas sessões `psql` no Postgres local fornecido pelo ambiente seguro, barreira de início, transações e asserts no resultado final. Não logar conexão. Recusar destino remoto; se não houver duas sessões, marcar prova concorrente pendente, não substituir por duas promises serializadas no mesmo cliente. Não adicionar dependência de runtime de produto.

### 0.4 Contratos de domínio e interfaces compartilhadas

Definir em 1B.1 `D/types.ts`. Datas civis são strings ISO validadas na borda com Zod; não usar `new Date('YYYY-MM-DD')` para interpretar meia-noite local.

```ts
export type Id = string;
export type DateKey = string; // YYYY-MM-DD validada
export type TaskStatus = 'Aberta' | 'Em andamento' | 'Aguardando' | 'Concluída';
export type OrderStatusV1 = 'Em andamento' | 'Finalizado' | 'Cancelado';
export type TaskPriority = 'Urgente' | 'Alta' | 'Normal' | 'Baixa';
export type WaitingType = 'customer' | 'utility' | 'supplier' | 'internal_user' | 'other';
export type Waiting = { type: WaitingType; userId: Id | null; note: string | null };
export type Member = { userId: Id; displayName: string | null };
export type Front = { id: Id; orderId: Id; name: string; position: number };
export type Subtask = { id: Id; taskId: Id; title: string; completed: boolean;
  dueDate: DateKey | null; priority: TaskPriority | null };
export type TaskV1 = { id: Id; organizationId: Id; orderId: Id | null; frontId: Id | null;
  title: string; description: string | null; status: TaskStatus; priority: TaskPriority;
  assigneeId: Id | null; legacyAssignee: string | null; dueDate: DateKey | null;
  followUpDate: DateKey | null; waiting: Waiting | null; updatedAt: string | null;
  completedAt: string | null };
export type OrderV1 = { id: Id; organizationId: Id; number: string; title: string;
  client: string; address: string; status: OrderStatusV1; createdAt: string;
  legacyPriority: 'Baixa' | 'Normal' | 'Alta'; utilityDueDate: DateKey | null };
export type Dependency = { taskId: Id; predecessorId: Id };
export type Capabilities = { statusMode: 'legacy' | 'v1'; timelineMode: 'legacy' | 'copying' | 'v1' };
export type WriteResult<T> = { ok: true; value: T } |
  { ok: false; code: 'forbidden' | 'conflict' | 'invalid' | 'reload'; message: string };
```

No banco, `tarefas.descricao` continua título; nova `descricao_detalhada` é descrição; `status`, `prioridade`, `follow_up_date`, `waiting_type`, `waiting_user_id`, `waiting_note`, `updated_at`. `subtarefas.vencimento/prioridade`; `pedido_frentes.nome/ordem`. Valores de status/prioridade persistidos são os rótulos acima; waiting usa códigos estáveis. Não duplicar título ou prazo com colunas novas.

`SupabaseClient` existente é a dependência injetada dos repositories/commands; nenhuma função usa singleton global nem chave privilegiada no navegador. Cada leitura recebe `organizationId`; a organização vem do helper existente e RLS é a defesa no banco. Falha de consulta é erro exibido, não lista vazia silenciosa. Mutação revalida a leitura afetada; impedir double-submit e descartar resposta de organização anterior.

## Gate 0.5 — Baseline de privilégios (pausa independente antes da Fundação)

**Arquivos:** criar M00, `DBT/pedidos_v1_baseline_privileges.test.sql`, `supabase/tests/helpers/pedidos-v1-fixtures.sql`, `supabase/verification/pedidos-v1-baseline-privileges.sql`. Nenhum arquivo de produto é alterado neste gate.

**Consome:** Gate 0 concluído, seis tabelas existentes e políticas por `organization_id`. **Produz:** as mesmas permissões efetivas de leitura e CRUD usadas pela UI, sem `TRUNCATE` para `authenticated` nas seis tabelas; nenhuma concessão nova a `anon`. Não mexe em schema de negócio, status, RLS, grants de outras tabelas ou privilégios `REFERENCES`/`TRIGGER`.

Mapa local conferido antes de desenhar M00 (todos os writes estão em `src/app/page.tsx`; consultas adicionais da Central/busca em `src/lib/central/queries.ts` e `src/lib/central/search.ts`):

| Tabela | Operações diretas que o app usa hoje | Fluxos concretos |
|---|---|---|
| `pedidos` | SELECT, INSERT, UPDATE, DELETE | lista/detalhe, criar, prioridade/status/campos e excluir Pedido |
| `tarefas` | SELECT, INSERT, UPDATE, DELETE | checklist, criar, título/prazo/conclusão e excluir Tarefa |
| `subtarefas` | SELECT, INSERT, UPDATE, DELETE | adicionar, marcar e excluir Subtarefa |
| `comentarios_tarefa` | SELECT, INSERT, DELETE | nota da Tarefa; sem UPDATE direto no app |
| `atividades` | SELECT, INSERT, DELETE | atividade do Pedido; sem UPDATE direto no app |
| `anexos` | SELECT, INSERT, DELETE | visualizar metadados/arquivo, subir e remover; exclusão do Pedido depende da ordem atual metadata→storage→Pedido; sem UPDATE direto no app |

O inventário de código acima é pré-condição de M00: reexecutar busca focal por `from('pedidos'|'tarefas'|'subtarefas'|'comentarios_tarefa'|'atividades'|'anexos')` antes de escrever SQL para detectar novos consumidores. Se aparecer operação direta nova, atualizar a matriz e seu teste antes de aplicar a migration. `REFERENCES` e `TRIGGER` continuam como estão porque o Gate 0 não provou que removê-los é compatível. Este gate só elimina `TRUNCATE`.

- [ ] RED pgTAP: no estado anterior a M00, `has_table_privilege('authenticated', tabela, 'TRUNCATE')` é verdadeiro e o assert de ausência falha. Preparar fixtures de duas organizações e identidades reais de teste, sem e-mails/credenciais; testar a matriz acima com A na própria organização e B tentando alterar a organização de A. Testes de `TRUNCATE` verificam **privilégio**, nunca executam o comando. Confirmar também que `anon` não ganhou SELECT/INSERT/UPDATE/DELETE/TRUNCATE e que as seis tabelas mantêm RLS.

```sql
SELECT ok(NOT has_table_privilege('authenticated','public.pedidos','TRUNCATE'),
  'authenticated cannot truncate pedidos');
SELECT ok(has_table_privilege('authenticated','public.tarefas','UPDATE'),
  'legacy task editing remains granted');
SELECT ok(NOT has_table_privilege('anon','public.anexos','SELECT'),
  'anon did not gain attachment access');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.tarefas'::regclass),
  'task RLS remains enabled');
```

- [ ] RED: `rtk proxy supabase test db supabase/tests/database/pedidos_v1_baseline_privileges.test.sql`; falha esperada exclusivamente no privilégio TRUNCATE anterior, enquanto a matriz de CRUD/RLS já passa. Simular identidades A/B localmente com role authenticated e `request.jwt.claim.sub`; não usar IURQ para RED.
- [ ] Implementação mínima de M00: em uma migration própria, `REVOKE TRUNCATE ON TABLE public.pedidos, public.tarefas, public.subtarefas, public.comentarios_tarefa, public.atividades, public.anexos FROM authenticated;`. Não usar `REVOKE ALL` nessas tabelas existentes, nem mudar policies. Não conceder nada a `anon` ou retirar INSERT/UPDATE/DELETE necessários ao app. A verificação pós-migration repete `has_table_privilege` para as seis tabelas e a matriz das operações acima; compara grants de `anon` com a linha de base.
- [ ] GREEN: repetir o mesmo pgTAP. Cobrir INSERT/SELECT/UPDATE/DELETE conforme a matriz com role A e expectativa de bloqueio/ausência para role B, incluindo metadados de anexo em fixture sintética. Para `comentarios_tarefa`, `atividades` e `anexos`, não inventar UPDATE como requisito: o app não usa e não há política UPDATE. TypeScript/lint não se aplicam. Verificação SQL `supabase/verification/pedidos-v1-baseline-privileges.sql` retorna somente tabela, RLS e booleanos de grants, sem ler dados de negócio.
- [ ] Gate humano antes da aplicação de M00 no IURQ; após autorização, confirmar project ref/migration pendente exclusiva, aplicar só M00, rodar a verificação read-only e testar os fluxos atuais com registros de QA da própria organização. Pausa segura: UI e schema de negócio continuam os mesmos; M01 não precisa seguir imediatamente. Recovery por migration corretiva focal se algum fluxo concreto falhar; nunca restaurar TRUNCATE como correção automática. Commit sugerido após aceite e staging seletivo: `security: retirar truncate do controle de pedidos`.

## Lote 1 — Fundação (9 gates)

### 1A.1 — Frentes aditivas e criação legada compatível

**Arquivos:** criar M01, `DBT/pedidos_v1_frentes.test.sql`, `supabase/verification/pedidos-v1-frentes.sql`; ampliar `supabase/tests/helpers/pedidos-v1-fixtures.sql` criado em 0.5.

**Consome:** Gate 0.5 aprovado e validado; `pedidos/tarefas`, PKs `(organization_id,id)`, `is_organization_member(uuid)`. Não depende de nomes de membros ou de `responsavel_user_id` preenchido. **Produz:** `pedido_frentes(id,organization_id,pedido_id,nome,ordem,is_legacy_default)`; `tarefas.frente_id` inicialmente nullable; chave `(organization_id,pedido_id,id)`; função privada `ensure_pedido_default_front(p_org uuid,p_pedido uuid) returns uuid`. `is_legacy_default` identifica a Frente de migração, não é categoria de produto.

- [ ] Escrever RED pgTAP: tabela/coluna inexistentes, usuário A não consegue ler/gravar B, tarefa no Pedido A não aceita Frente de outro Pedido A, duas inserções legadas sem frente convergem para uma Geral.

```sql
SELECT has_table('public', 'pedido_frentes');
SELECT col_is_null('public', 'tarefas', 'frente_id');
SELECT ok(NOT has_table_privilege('anon', 'public.pedido_frentes', 'SELECT'));
SELECT ok(NOT has_table_privilege('authenticated','public.pedido_frentes','TRUNCATE'));
-- Nas fixtures, INSERT de tarefa com Frente de outro Pedido deve produzir 23503.
```

- [ ] RED: `rtk proxy supabase test db supabase/tests/database/pedidos_v1_frentes.test.sql`; esperar falha de tabela/contrato.
- [ ] Implementar M01: após `CREATE TABLE public.pedido_frentes`, executar **na mesma migration, antes dos GRANTs**:

```sql
REVOKE ALL ON public.pedido_frentes FROM PUBLIC;
REVOKE ALL ON public.pedido_frentes FROM anon;
REVOKE ALL ON public.pedido_frentes FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedido_frentes TO authenticated;
```

RLS CRUD por membro da organização continua obrigatória; confirmar os privilégios **efetivos**: authenticated só recebe o CRUD acima, sem TRUNCATE/REFERENCES/TRIGGER, e anon não recebe acesso. FK Frente→Pedido ON DELETE CASCADE conforme ownership; unique `(organization_id,pedido_id,id)` e índice parcial único `(organization_id,pedido_id) WHERE is_legacy_default`. FK de tarefa `(organization_id,pedido_id,frente_id)`→Frente com ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE, impedindo apagar Frente referenciada e permitindo ao DELETE de Pedido remover seus filhos na mesma transação; `NOT VALID` se necessário e `MATCH SIMPLE` durante expansão. Testar especificamente DELETE de Pedido sem anexos. Trigger de INSERT legado sem Frente chama a função abaixo; não preencher massa ainda. Não fazer trigger de UPDATE que altere tarefas antigas ao apenas ler/exibir.

```sql
-- Núcleo de ensure_pedido_default_front: executar sob lock do Pedido.
SELECT id FROM public.pedidos
WHERE organization_id = p_org AND id = p_pedido FOR UPDATE;
INSERT INTO public.pedido_frentes(organization_id,pedido_id,nome,ordem,is_legacy_default)
VALUES (p_org,p_pedido,'Geral',0,true)
ON CONFLICT (organization_id,pedido_id) WHERE is_legacy_default
DO UPDATE SET is_legacy_default = true RETURNING id;
```

- [ ] GREEN: mesmo pgTAP; confirmar o trigger preserva o INSERT atual de `src/app/page.tsx`. SQL de verificação: contagem de Frentes por Pedido, tarefas sem Frente, anti-join com Frente por org/Pedido e grants efetivos de PUBLIC/anon/authenticated, inclusive ausência de TRUNCATE; ausência de Frente em registros antigos ainda é permitida. TypeScript/lint: não aplicável.
- [ ] Gate: aplicar somente M01 após aprovação; no IURQ abrir Pedido antigo e criar tarefa pelo app atual. Pausa segura: schema expandido funciona com UI antiga. Recuperação: manter colunas/tabela aditivas, corrigir trigger em nova migration; não apagar Frentes que já receberam tarefas. Commit sugerido: `feat: preparar frentes compativeis com pedidos existentes`.

### 1A.2 — Estados, espera e identidade da organização

**Arquivos:** criar M02, `DBT/pedidos_v1_status_members.test.sql`, `supabase/verification/pedidos-v1-status-members.sql`; ampliar helper de fixtures.

**Consome:** resultado da inspeção focal read-only abaixo, membership e campos legados. **Produz:** campos novos de tarefa, constraint ampliada de Pedido; `list_pedido_members(p_org uuid) returns table(user_id uuid,display_name text)` com nome nullable; `set_pedido_member_display_name(p_org uuid,p_member uuid,p_name text) returns void` para admin da própria organização; `assign_legacy_pedido_tasks(p_org uuid,p_task_ids uuid[],p_member uuid) returns integer` para associação explícita e revisada no Gate 1B.3; `pedidos_v1_capabilities(p_org uuid) returns jsonb`; estado técnico privado `private.pedidos_v1_rollout` de uma linha com `status_mode='legacy'`, `timeline_mode='legacy'`. Só migrations alteram esse estado; nenhuma permissão de usuário. Não é status de negócio.

**Pré-condição read-only, antes de escrever M02:** não repetir o Gate 0 agregado. Inspecionar somente fonte e manutenção de nome de membro no IURQ autorizado: colunas relevantes de `auth.users`/metadata sem retornar e-mails ou dados pessoais, `organization_members`, existência de perfis/convites e políticas de acesso; no repositório, examinar migrations de membership e helpers/componentes (`src/app/page.tsx`, `src/types/index.ts`, `src/components/OrderDrawer.tsx`, `src/lib/pedidos-tarefas/organization.ts`, app shell). O código hoje usa `TeamMember` fixo e infere nomes por substring do e-mail; isso não é fonte confiável. Registrar no relato do gate uma das decisões: (a) fonte canônica existente com escopo de organização e manutenção demonstrados, ou (b) nenhuma fonte adequada, então `organization_members.display_name` será a fonte canônica mínima. A evidência do Gate 0 (2 membros sem nome nos campos de metadata verificados) favorece (b), mas não substitui esta busca focal. Se houver fonte confiável alternativa, **parar antes de M02** e ajustar seu contrato neste plano para usá-la, sem manter duas fontes de verdade. Nenhum nome/e-mail é publicado no relato da inspeção.

- [ ] RED: diretório retorna dois `user_id` de A, nomes nullable enquanto não cadastrados, nenhum membro de B; B/anon não obtêm A. Admin A pode nomear somente membro A, membro comum não pode nomear outro, homônimos podem coexistir, nome vazio/espacial é rejeitado. A atribuição explícita de tarefa legada só aceita IDs da própria organização e não altera `responsavel` textual; tarefa sem correspondência não é modificada. Além disso, internal_user de B e internal_user sem ID falham; waiting_type nulo com user_id preenchido falha; nomes de pessoas nunca são tipos de espera; tarefa antiga sem timestamp não ganha data inventada.

```sql
SELECT has_function('public', 'list_pedido_members', ARRAY['uuid']);
SELECT ok(NOT has_function_privilege('anon','public.list_pedido_members(uuid)','EXECUTE'));
SELECT has_column('public','organization_members','display_name');
SELECT ok(NOT has_table_privilege('authenticated','public.organization_members','UPDATE'));
SELECT ok(NOT has_table_privilege('authenticated','private.pedidos_v1_rollout','UPDATE'));
SELECT col_is_null('public','tarefas','updated_at');
```

- [ ] RED: `rtk proxy supabase test db supabase/tests/database/pedidos_v1_status_members.test.sql`.
- [ ] Implementar M02: se a pré-condição confirmou ausência de fonte confiável, adicionar `organization_members.display_name text NULL` com CHECK `display_name IS NULL OR (display_name=btrim(display_name) AND char_length(display_name) BETWEEN 1 AND 120)`; sem UNIQUE, pois homônimos são permitidos. A PK `(organization_id,user_id)` continua a identidade. Não preencher nomes atuais por e-mail nem criar tabela de perfis paralela. `organization_members` continua SELECT-only para authenticated; somente RPC admin pode gravar o nome de membro no mesmo tenant. `assign_legacy_pedido_tasks` exige admin, valida todos os task IDs e o membro antes de escrever atomicamente, altera apenas `responsavel_user_id` de tarefas ainda sem ID e conserva `responsavel`. A UI de revisão/atribuição só chega em 1B.3. As funções SECURITY DEFINER têm `search_path=''`, `auth.uid()` obrigatório, checagem de admin e membership, EXECUTE revogado de PUBLIC/anon e concedido apenas a authenticated. Acrescentar colunas nullable de tarefa, prioridade default Normal, status derivado pelo trigger para writes legados; ampliar `pedidos_status_check` com união dos sete valores. `updated_at` sem default retroativo: só novos inserts/alterações reais recebem agora; backfill não dispara atualização histórica. A regra de espera exige tipo quando status Aguardando; `internal_user` exige membro; outros tipos exigem user_id nulo. Ao sair de Aguardando, limpar campos ativos após registrar mudança histórica. FK `(organization_id,waiting_user_id)`→membership. Responsável: inventariar IDs antigos fora de membership antes de `NOT VALID`; só novos vínculos são validados inicialmente. Remoção de membro referenciado usa RESTRICT, evitando invalidar tarefa silenciosamente.

```sql
CHECK (waiting_type IS NULL OR waiting_type IN ('customer','utility','supplier','internal_user','other')),
CHECK ((waiting_type IS NOT DISTINCT FROM 'internal_user' AND waiting_user_id IS NOT NULL)
    OR (waiting_type IS DISTINCT FROM 'internal_user' AND waiting_user_id IS NULL)),
CHECK (status IS DISTINCT FROM 'Aguardando' OR waiting_type IS NOT NULL)
```

Diretório é SECURITY DEFINER com `search_path=''`, relações qualificadas, `auth.uid()` e membership verificados, grant EXECUTE apenas authenticated. Retornar apenas UUID e `organization_members.display_name` nullable; não retornar email/metadata/role. Na UI, nome nulo aparece como `Membro sem nome · <trecho do UUID>` e nunca entra na resolução automática. `display_name` não autoriza acesso nem identifica a pessoa por si só; filtros e ownership usam `user_id`. A resolução automática de texto legado exige exatamente um membro da organização com nome igual após `lower(btrim(...))`, sem remover acentos e sem desempate arbitrário. A tabela técnica `private.pedidos_v1_rollout` também revoga todos os grants herdados de PUBLIC/anon/authenticated antes de qualquer uso; teste `has_table_privilege` comprova ausência de acesso direto e TRUNCATE.

- [ ] GREEN: repetir pgTAP com RLS autenticada e dados sintéticos de fixtures, além de constraints; verificação SQL conta status, missing IDs, IDs fora de membership, waiting inválido, nomes nulos e grants efetivos da tabela técnica. Pausa mantém bool canônico e UI antiga; recovery mantém adições e revoga diretório se houver vazamento, sem remover dados. TS/lint não aplicável.
- [ ] Gate IURQ: comparar inventário com base, validar membro comum e admin, abertura/criação/conclusão antiga intactas. Commit sugerido: `feat: preparar estados e membros de tarefas por organizacao`.

### 1A.3 — Subtarefas e dependências isoladas

**Arquivos:** criar M03, `DBT/pedidos_v1_dependencies.test.sql`, `supabase/verification/pedidos-v1-dependencies.sql`, `scripts/tests/pedidos-concurrency.mjs`; ampliar fixtures.

**Consome:** tarefa, Frente, Pedido e membership. **Produz:** `subtarefas.vencimento date`, `prioridade text null`; `tarefa_dependencias(organization_id,pedido_id,tarefa_id,predecessora_id)`; RPCs `add_pedido_dependency(p_org uuid,p_task uuid,p_predecessor uuid) returns void`, `remove_pedido_dependency` com mesma assinatura.

- [ ] RED: A→A, A→B duplicada, ciclo de três nós, outro tenant/Pedido, órfão e corrida A→B/B→A; subtotal concluído não altera pai. Prazo/prioridade opcional round-trip.

```sql
SELECT has_table('public','tarefa_dependencias');
SELECT has_column('public','subtarefas','vencimento');
SELECT ok(NOT has_table_privilege('authenticated','public.tarefa_dependencias','INSERT'));
SELECT ok(NOT has_table_privilege('authenticated','public.tarefa_dependencias','TRUNCATE'));
SELECT ok(NOT has_table_privilege('anon','public.tarefa_dependencias','SELECT'));
```

- [ ] RED: `rtk proxy supabase test db supabase/tests/database/pedidos_v1_dependencies.test.sql`; concorrência `rtk proxy node scripts/tests/pedidos-concurrency.mjs dependencies` deve falhar no comportamento anterior.
- [ ] M03: imediatamente após criar `public.tarefa_dependencias`, `REVOKE ALL` de PUBLIC, anon e authenticated; conceder somente SELECT a authenticated, com RLS por membro, e deixar writes exclusivamente à RPC segura. Testar grants efetivos de SELECT, ausência de INSERT/UPDATE/DELETE/TRUNCATE para authenticated e ausência de acesso de anon. PK `(organization_id,tarefa_id,predecessora_id)`, CHECK IDs distintos, duas FKs `(organization_id,pedido_id,id)` às tarefas (criar unique correspondente). RPC bloqueia linha do Pedido `FOR UPDATE`, verifica caminhos via CTE recursiva antes de inserir. Leitura RLS e FKs continuam exigidas com RPC definer. Índices em cada ponta; delete tarefa remove somente suas arestas. Nenhuma mudança na conclusão pai/filho.

```sql
WITH RECURSIVE reach(id) AS (
  SELECT p_predecessor
  UNION
  SELECT d.predecessora_id FROM public.tarefa_dependencias d JOIN reach r ON d.tarefa_id=r.id
  WHERE d.organization_id=p_org AND d.pedido_id=v_pedido
) SELECT EXISTS(SELECT 1 FROM reach WHERE id=p_task) INTO v_cycle;
```

- [ ] GREEN ambos comandos; verificar contagem de ciclos/órfãos igual zero e sem vínculos cruzados. Harness deve provar uma transação rejeitada na corrida inversa. TS não aplicável; lint do arquivo `.mjs` via `rtk proxy npx eslint scripts/tests/pedidos-concurrency.mjs`.
- [ ] Gate IURQ: adicionar/remover relação em registros de QA pela RPC, provar isolamento, continuar usando UI atual. Recovery: manter colunas e suspender RPC problemática; nenhuma regra automática depende dela. Commit sugerido: `feat: adicionar prazos de subtarefas e dependencias seguras`.

### 1B.1 — Leitores tolerantes, sem trocar a fonte canônica

**Arquivos:** criar `D/types.ts`, `D/mappers.ts`, `D/mappers.test.ts`, `D/members.ts`, `D/members.test.ts`, `D/test-fixtures.ts`, `src/lib/sorting.test.ts`, `src/components/StatusBadge.test.tsx`; modificar `src/types/index.ts`, `src/data/mock.ts`, `src/app/page.tsx`, `src/components/OrderCard.tsx`, `src/components/StatusBadge.tsx`, `src/components/NewOrderDrawer.tsx`, `src/components/OrderDrawer.tsx`, `src/lib/sorting.ts`, `src/lib/central/operational.ts`, `src/lib/central/operational.test.ts`.

**Consome:** schema expandido e RPCs M02. **Produz:** `normalizeOrderStatus(raw:string):OrderStatusV1`, `mapTask(row:TaskRow,mode:Capabilities['statusMode']):TaskV1`, `listMembers(client:SupabaseClient,org:Id):Promise<Member[]>`, `resolveNamedMember(members:Member[],name:string):Id|null`. `TaskRow` espelha os campos SQL de 0.4 e `concluido`; optional somente para colunas ainda ausentes do fixture, nunca `any`. `src/types/index.ts:Task` recebe `assigneeUserId?:string|null`, preenchido do `responsavel_user_id` quando presente; o texto legado continua em `assignee`. Isso permite ao Gate 1B.3 trocar “Minhas” para ID sem refazer a página. `test-fixtures.ts` exporta `taskFixture(patch:Partial<TaskV1>={}):TaskV1`, base Aberta/Normal org-a/order-a/front-a, datas null; `orderFixture(patch:Partial<OrderV1>={}):OrderV1`, base Em andamento; IDs de teste de funções puras podem ser strings legíveis.

- [ ] RED com tabela de mapeamento dos sete status de Pedido, status vazio de tarefa, nome ambíguo e sem timestamp.

```ts
expect(normalizeOrderStatus('Concluído')).toBe('Finalizado');
expect(normalizeOrderStatus('Prazo Concessionária')).toBe('Em andamento');
expect(resolveNamedMember([{userId:'a',displayName:'Thomás'},
  {userId:'b',displayName:'Thomás'}], 'Thomás')).toBeNull();
```

- [ ] RED: `rtk npm test -- src/lib/pedidos-tarefas/mappers.test.ts src/lib/pedidos-tarefas/members.test.ts src/components/StatusBadge.test.tsx src/lib/sorting.test.ts src/lib/central/operational.test.ts`. O teste de sorting mantém a ordenação determinística com os três status normalizados, sem indexar ranking legado inexistente.
- [ ] Implementar adapters e renderização tolerante nos consumidores; continuar a gravação antiga até 1C.1, com encoding de Pedido conforme capability. `OrderStatus` de UI migra ao tipo normalizado; conservar `Priority` legada separada. `Task.completed` transitório é projeção do mapper. `TeamMember` deixa de restringir nomes reais nos contratos de tarefa. Não expor novos campos de workflow antes da capability v1.

```ts
export function normalizeOrderStatus(raw: string): OrderStatusV1 {
  if (raw === 'Concluído' || raw === 'Finalizado') return 'Finalizado';
  if (raw === 'Cancelado') return 'Cancelado';
  if (['Ação Pendente','Aguardando Cliente','Prazo Concessionária','Em andamento'].includes(raw))
    return 'Em andamento';
  throw new Error('Status de Pedido não reconhecido');
}
```

- [ ] GREEN mesmo comando, TS/lint dos arquivos da tarefa. Não transformar status desconhecido em Aberta silenciosamente. Filtros de identidade novos usam IDs; nomes antigos continuam visíveis como não resolvidos.
- [ ] Gate IURQ: app compatível deve ser publicado/autorizado antes do backfill, abrir todos os status antigos, abrir links existentes da Central, conferir criação/edição. Pausa segura com banco expandido e dados antigos. Commit sugerido: `refactor: normalizar leituras de pedidos durante transicao`.

### 1B.2 — Backfill idempotente e proveniência

**Arquivos:** criar M04, `DBT/pedidos_v1_backfill.test.sql`, `supabase/verification/pedidos-v1-backfill.sql`; ampliar fixtures.

**Consome:** UI 1B.1 validada, estruturas M01–03. **Produz:** Geral por Pedido preexistente, tarefas associadas, status/identidades compatíveis, proveniência de transição em `atividades`. Acrescentar `migration_key text` nullable com índice único parcial `(organization_id,migration_key)`; extensão estritamente para proveniência, sem expor timeline nova antes do Lote 5.

- [ ] RED: executar corpo de backfill duas vezes na fixture e obter mesmas contagens/IDs; conservar os quatro responsáveis textuais da linha de base IURQ com `responsavel_user_id=NULL`, inclusive se algum texto passar a coincidir com nome cadastrado antes de M04; conservar prazo, conclusão e `updated_at=NULL`; preservar status antigo em atividade, incluindo data de migração claramente identificada (não apresentada como data original da mudança).

```sql
SELECT is((SELECT count(*)::int FROM public.pedido_frentes WHERE is_legacy_default),3);
SELECT is((SELECT count(*)::int FROM public.tarefas WHERE frente_id IS NULL),0);
SELECT is((SELECT count(*)::int FROM public.tarefas WHERE updated_at IS NOT NULL),0);
SELECT is((SELECT count(*)::int FROM public.tarefas
  WHERE responsavel IS NOT NULL AND responsavel_user_id IS NULL),4);
```

- [ ] RED: `rtk proxy supabase test db supabase/tests/database/pedidos_v1_backfill.test.sql`.
- [ ] M04 separada das adições: bloquear writes nas linhas/lote durante cópia, capturar proveniência antes de converter; migration transacional e reexecutável no teste. Mapear Concluído→Finalizado, outros→Em andamento, bool→status. **M04 não escreve `tarefas.responsavel_user_id` em nenhuma tarefa legada**: os quatro casos atuais conservam texto e ID nulo, sem inferência de e-mail/nome. IDs válidos que já existirem permanecem intactos. Qualquer ID inválido preexistente exige reparo explícito aprovado, nunca apagamento automático. A associação nominal, quando houver prova/decisão de administrador, pertence ao Gate 1B.3 e ocorre fora do backfill de M04. Sessão de migração usa rotina privada para não fabricar timestamps.

```sql
INSERT INTO public.atividades(organization_id,pedido_id,descricao,usuario,migration_key)
SELECT organization_id,id,'Status anterior: '||status,'Sistema', 'pedidos-v1-status:'||id
FROM public.pedidos WHERE status IN ('Ação Pendente','Aguardando Cliente','Prazo Concessionária','Concluído')
ON CONFLICT (organization_id,migration_key) WHERE migration_key IS NOT NULL DO NOTHING;
```

- [ ] GREEN e verificação: comparar contagens antes/depois das seis tabelas antigas; verificar explicitamente `responsavel` inalterado e `responsavel_user_id` não preenchido para as quatro tarefas atuais; anti-joins tarefa/Frente e membership; zero status desconhecidos, divergência bool/status, timestamps artificiais. `subtarefas.tarefa_id` e `comentarios_tarefa.tarefa_id` historicamente nullable: contar nulos, não excluir; associação desconhecida exige decisão sobre dado concreto antes de endurecer/migrar esse registro.
- [ ] Gate IURQ: mostrar inventário e conjunto afetado antes da aplicação; após aplicar conferir Pedidos de amostra com anexos/notas. Recovery: transação falha reverte tudo; depois do commit, manter UI compatível e corrigir para frente; não desfazer mapeamento de status com UPDATE indiscriminado após novos writes. TS/lint não aplicável. Commit sugerido: `data: migrar frentes e estados com proveniencia`.

### 1B.3 — Prontidão nominal e associação explícita de responsáveis

**Arquivos:** criar `UI/MemberNameEditor.tsx`, `UI/MemberNameEditor.test.tsx`, `D/mine.ts`, `D/mine.test.ts`; modificar `D/members.ts`, `D/members.test.ts`, `src/app/page.tsx`. Nenhuma migration nova: usa o membership e as RPCs preparadas em M02. Não altera a spec nem estabelece uma segunda tabela de nomes.

**Consome:** `Member={userId:Id;displayName:string|null}`, `listMembers(client:SupabaseClient,org:Id):Promise<Member[]>` de 1B.1 e RPCs de M02. **Produz:** `listUnassignedLegacyTasks(client:SupabaseClient,org:Id):Promise<Array<{taskId:Id;label:string}>>`, `setMemberDisplayName(client:SupabaseClient,org:Id,userId:Id,name:string):Promise<WriteResult<void>>`, `assignLegacyTasks(client:SupabaseClient,org:Id,taskIds:Id[],userId:Id):Promise<WriteResult<number>>`, `formatMemberLabel(member:Member):string`, `isMyTask(task:{assigneeUserId:Id|null},viewerId:Id):boolean`. `MemberNameEditor({organizationId,onChanged})` oferece ao administrador associação revisada dos textos legados a membros reais da mesma organização; não usa e-mail. Todos os filtros futuros continuam usando user_id.

- [ ] RED: dois membros homônimos permanecem válidos, mas `resolveNamedMember` retorna null para texto ambíguo; nome null gera rótulo `Membro sem nome · <UUID abreviado>` sem sugerir assignee; membro comum não altera display_name nem associação; administrador A não modifica membership/tarefas B; confirmação de um grupo de tarefas conserva `responsavel` original e grava somente `responsavel_user_id` real. O mesmo clique duas vezes não reatribui a outro membro. Quatro tarefas atuais permanecem sem ID após M04 e só recebem ID na operação aprovada neste gate.

```ts
expect(resolveNamedMember([
  {userId:'u1',displayName:'Thomás'},
  {userId:'u2',displayName:'Thomás'}
], '  thomás ')).toBeNull();
expect(formatMemberLabel({userId:'12345678-aaaa',displayName:null}))
  .toBe('Membro sem nome · 12345678');
expect(isMyTask({assigneeUserId:null},'u1')).toBe(false);
expect(isMyTask({assigneeUserId:'u1'},'u1')).toBe(true);
```

- [ ] RED: `rtk npm test -- src/lib/pedidos-tarefas/members.test.ts src/lib/pedidos-tarefas/mine.test.ts src/components/pedidos-tarefas/MemberNameEditor.test.tsx`; repetir `rtk proxy supabase test db supabase/tests/database/pedidos_v1_status_members.test.sql` após acrescentar os casos da associação explícita, sem migration nova.
- [ ] Implementar wrappers finos em D/members.ts e controle administrativo compacto na página existente, com identificação de admin pela membership própria e verificação final pela RPC. Primeiro um administrador da organização fornece nomes que ele consegue verificar por processo humano legítimo; não adivinhar por e-mail, substring ou posição. O editor mostra o texto legado e os membros da mesma organização; sugere somente correspondência normalizada única (`lower(btrim(...))`, acentos preservados); exige confirmação explícita de IDs de destino. Texto sem correspondência única pode ser associado por escolha humana, sem alterar o texto original. Remover a inferência de `currentUser` por substring de e-mail em `src/app/page.tsx`: usar `session.user.id` e membership para apresentação, `isMyTask` para filtro “Minhas”, ID de membro para ownership. Tarefa sem ID continua visível em “Todas”, com responsável textual legado, até associação explícita. Não escrever nem exibir e-mails no relatório de gate. Novos membros recebem display_name pelo mesmo controle; não existe tabela de perfis paralela.
- [ ] GREEN: mesmos testes de Vitest/pgTAP, `rtk proxy npx tsc --noEmit` e lint focal de 0.2. Verificação read-only no IURQ: total de membros com nome preenchido, textos com zero/uma/várias correspondências, tarefas com/sem user_id e anti-join org/user; relatar somente contagens. Para dados que serão preservados, o Gate 1B.3 não é declarado pronto se os membros ativos ainda não tiverem nomes confiáveis ou se tarefas legadas continuarem sem identidade necessária às filas “Minhas”. Se a pessoa responsável não puder ser identificada com evidência suficiente, manter ID nulo e **parar a liberação das funcionalidades nominais**, sem inventar uma associação. Se o responsável pelo produto classificar explicitamente todo o conjunto atual como teste descartável, não associar esses registros: validar o fluxo com fixtures sintéticas e registrar a decisão; a remoção efetiva continua sendo uma operação destrutiva separada e autorizada antes do uso real.
- [ ] Gate humano no IURQ: para dados preserváveis, revisão dos nomes pelo administrador e dos vínculos de tarefa antes de gravá-los; para conjunto integralmente descartável confirmado pelo responsável do produto, aceite explícito de que nenhuma reconciliação será feita. Em ambos os casos, QA de isolamento e regressão da tela atual. A pausa segura anterior continua possível com nomes/IDs faltantes porque o app compatível mostra o texto legado. Recovery: corrigir associação específica via RPC administrativa auditada, nunca rodar M04 novamente para inferir IDs. Commit sugerido após aprovação: `feat: preparar nomes e identidade de responsaveis`.

### 1C.1 — Preparar comandos e ações humanas

**Arquivos:** criar M05, `D/commands.ts`, `D/commands.test.ts`, `DBT/pedidos_v1_commands.test.sql`, `supabase/verification/pedidos-v1-commands.sql`; modificar `src/app/page.tsx`, `src/components/OrderDrawer.tsx`, `src/components/NewOrderDrawer.tsx`, `scripts/tests/pedidos-concurrency.mjs`; criar `src/components/OrderDrawer.transitions.test.tsx`.

**Consome:** tipos e capabilities de 0.4. **Produz:** `createOrder(client,org,input:OrderInput):Promise<WriteResult<Id>>`, `updateOrder(client,org,id,patch:Partial<OrderInput>):Promise<WriteResult<void>>`, `createTask(client,org,input:TaskInput):Promise<WriteResult<Id>>`, `updateTask(client,org,id,patch:TaskPatch):Promise<WriteResult<TaskV1>>`, `setOrderStatus(client,org,id,status:OrderStatusV1):Promise<WriteResult<void>>`, `saveSubtask(client,org,input:SubtaskInput):Promise<WriteResult<void>>`, `removeTask(client,org,id):Promise<WriteResult<void>>`. Todos parâmetros client são `SupabaseClient`, org/id são `Id`. Criador/updatedAt só banco. Tipos em `D/commands.ts`:

```ts
export type OrderInput = {number:string;title:string;client:string;address:string;
  legacyPriority:'Baixa'|'Normal'|'Alta';utilityDueDate:DateKey|null;
  customerId?:Id|null;siteId?:Id|null;contactId?:Id|null;cep?:string|null};
export type TaskPatch = Partial<Pick<TaskV1,'title'|'description'|'frontId'|'status'|'priority'|
  'assigneeId'|'dueDate'|'followUpDate'|'waiting'>>;
export type TaskInput = TaskPatch & {title:string;orderId:Id|null;frontId:Id|null};
export type SubtaskInput = {id:Id|null;taskId:Id;patch:Partial<Pick<Subtask,
  'title'|'completed'|'dueDate'|'priority'>>};
```

Em create, null id de subtarefa gera UUID e exige título; em update, checkbox envia somente completed. Isso preserva a distinção entre data ausente e data manualmente limpa no Lote 4.

RPCs SQL `create_pedido(p_org uuid,p_input jsonb) returns uuid`, `update_pedido(p_org uuid,p_id uuid,p_patch jsonb) returns void`, `create_pedido_task(p_org uuid,p_input jsonb) returns uuid`, `update_pedido_task(p_org uuid,p_id uuid,p_patch jsonb) returns jsonb`, `set_pedido_status(p_org uuid,p_id uuid,p_status text) returns void`, `save_pedido_subtask(p_org uuid,p_input jsonb) returns void`, `remove_pedido_task(p_org uuid,p_id uuid) returns void`. JSON usa as chaves camelCase dos tipos TS, mapeadas explicitamente às colunas snake_case; campos extras rejeitados; não executar SQL dinâmico arbitrário.

Preparar também `remove_pedido_front(p_org uuid,p_front uuid,p_destination uuid) returns void`: trava Pedido, valida destino diferente e no mesmo Pedido, move tarefas antes de apagar a Frente; sem destino, só remove Frente sem tarefas. Regras de Frente não alteram status do Pedido. Teste pgTAP garante rollback integral se destino inválido; a UI dessa operação será entregue em 2C. M14 e M15 estendem a mesma transação para novos contextos, sem segundo fluxo de remoção.

- [ ] RED: concluir última tarefa não escreve status de Pedido; completar subtarefas não completa pai; finalizar exige confirmação; tarefa em Pedido fechado é rejeitada; defaults usam auth.uid; erro do banco não mostra sucesso; corrida criar/finalizar serializa.

```ts
// Spy de cliente RPC: o comando de conclusão não dispara set_pedido_status.
await updateTask(client, 'org-a', 'task-a', {status:'Concluída'});
expect(client.rpc).toHaveBeenCalledTimes(1);
expect(client.rpc).toHaveBeenCalledWith('update_pedido_task', {
  p_org:'org-a', p_id:'task-a', p_patch:{status:'Concluída'}
});
```

- [ ] RED: `rtk npm test -- src/lib/pedidos-tarefas/commands.test.ts src/components/OrderDrawer.transitions.test.tsx`; `rtk proxy supabase test db supabase/tests/database/pedidos_v1_commands.test.sql`; `rtk proxy node scripts/tests/pedidos-concurrency.mjs order-close`.
- [ ] M05 e client fino: RPC verifica membership, trava Pedido antes da tarefa, aplica input validado e insere registros operacionais relevantes em `atividades` existentes. Enquanto legacy, mapear somente Aberta/Concluída para bool; outros estados retornam `reload`/recurso ainda não ativado. RPC de Pedido aceita os três status, armazenando a forma aceita pela fase; a coluna única continua canônica. Trocar **todos** os callbacks existentes de tarefa/status, remover auto conclusão/reabertura de `handleToggleTask` e `handleAddTask`. Campo concluido não é mais enviado pelo cliente novo. Para tarefas do Pedido, campos mínimos título/Frente e default creator; primeira tarefa cria Geral atomicamente. Demais mutações preservadas, agora sem reabrir Pedido como efeito colateral.

Migrar também `handleUpdateOrder` para updateOrder. A rotina privada `record_pedido_task_event(p_org uuid,p_task uuid,p_event text,p_text text) returns void` grava em atividades com `migration_key='system:' || gen_random_uuid()`; esse prefixo técnico distingue operações das atividades manuais atuais sem antecipar UI de timeline. Descrição inclui contexto legível da tarefa. Backfill de 5A reconhece esse prefixo. Guard de INSERT/DELETE impede cliente direto de fornecer migration_key ou remover eventos de sistema; execução privada não é autorizada por flag enviada pelo navegador. Autor de novos registros é auth.uid e nome resolvido, não currentUser inferido de e-mail. Atividades manuais existentes conservam o formulário atual e default de autor autenticado.

```ts
const {data,error} = await client.rpc('update_pedido_task', {
  p_org: org, p_id: id, p_patch: patch
});
// Converter SQLSTATE 42501/23514/23503/40001 em WriteResult, nunca engolir erro.
```

- [ ] GREEN todos comandos, TS/lint dos arquivos tocados. Habilitar controles V1 apenas pela capability, e manter operação vigente até ativação. Em legacy, novos clientes já respeitam conclusão manual; durante janela de publicação retirar clientes antigos ativos antes da ativação.
- [ ] Gate IURQ: aprovar M05, disponibilizar build compatível e verificar CRUD completo antigo, sem auto-finalizar/reabrir. Recovery usa build 1C.1 com schema expandido; não voltar ao build com auto-finalização. Commit sugerido: `refactor: centralizar comandos e conclusao manual de pedidos`.

### 1C.2 — Ativar status canônico e barrar writers obsoletos

**Arquivos:** criar M06, `DBT/pedidos_v1_activate.test.sql`, `supabase/verification/pedidos-v1-activate.sql`; modificar `D/commands.test.ts`, `src/components/OrderDrawer.transitions.test.tsx`.

**Consome:** aplicação 1C.1 disponível e aprovada. **Produz:** capability `statusMode='v1'`, trigger único status→bool, gravações de status/tarefa somente pelos comandos autorizados.

- [ ] RED: atualizar só bool como cliente antigo é recusado; RPC status conclui/reabre tarefa sincronizando projeção; payload com status e bool conflitantes falha; Finalizado e Cancelado não aceitam nova tarefa até reabrir explicitamente.

```sql
SELECT ok(NOT has_column_privilege('authenticated','public.tarefas','concluido','UPDATE'));
SELECT ok(NOT has_column_privilege('authenticated','public.pedidos','status','UPDATE'));
SELECT is((SELECT count(*)::int FROM public.tarefas
  WHERE concluido IS DISTINCT FROM (status='Concluída')),0);
```

- [ ] RED: `rtk proxy supabase test db supabase/tests/database/pedidos_v1_activate.test.sql`; `rtk npm test -- src/lib/pedidos-tarefas/commands.test.ts src/components/OrderDrawer.transitions.test.tsx`.
- [ ] M06, transacional: reconciliar deltas surgidos após M04 sob lock; mudar modo privado; substituir trigger para status canônico; revogar grants diretos de INSERT/UPDATE/DELETE em tarefas e INSERT/UPDATE em Pedidos, mantendo SELECT e DELETE de Pedido com proteções existentes; oferecer nos RPCs todas as operações removidas. Verificar que `handleUpdateOrder` já usa updateOrder de M05. Não publicar M06 com callback de tarefa/Pedido ainda escrevendo diretamente nas operações revogadas. Subtarefas mantêm writes seguros ou RPC, sem qualquer auto conclusão.

```sql
UPDATE private.pedidos_v1_rollout SET status_mode='v1';
-- No trigger canônico:
NEW.concluido := NEW.status = 'Concluída';
-- Transição para Concluída grava concluida_em; reabrir limpa a conclusão atual.
-- Historico permanece em atividades; regras de template guardarão primeira materialização.
```

- [ ] GREEN ambos comandos, TS/lint dos testes alterados. Capturar erro de cliente obsoleto com orientação de recarregar no build suportado. Antes da ativação, verificar não haver escritores conhecidos fora da aplicação preparada. Um cliente antigo não pode auto-finalizar nem gravar bool após cutover.
- [ ] Gate IURQ explícito de ativação: usuário valida quatro estados, cinco tipos de espera, membro real, prioridade independente e conclusão manual. Pausa segura em V1 com bool somente projeção. Recovery: corrigir adiante ou voltar ao build 1C.1 que já entende modo V1; nunca retornar modo legacy após estados ricos sem transformação aprovada. Commit sugerido: `feat: ativar status canonico e bloquear writers legados`.

### 1D — Validar constraints e encerrar compatibilidade de escrita

**Arquivos:** criar M07, `DBT/pedidos_v1_constraints.test.sql`, `supabase/verification/pedidos-v1-constraints.sql`; modificar `D/mappers.test.ts` para garantir leitura histórica ainda tolerante.

**Consome:** aceite 1C.2, inventário limpo. **Produz:** constraints validadas, status novos obrigatórios, tarefa com Pedido sempre com Frente, FK de membros validada, legado somente para leitura/projeção.

- [ ] RED: constraints marcadas `convalidated`; status legado rejeitado; nenhum vínculo sem Frente; campos históricos não removidos.

```sql
SELECT is((SELECT count(*)::int FROM pg_constraint WHERE conrelid IN
  ('public.tarefas'::regclass,'public.pedido_frentes'::regclass)
  AND contype='f' AND NOT convalidated),0);
SELECT has_column('public','tarefas','responsavel');
SELECT has_column('public','tarefas','prazo');
```

- [ ] RED: `rtk proxy supabase test db supabase/tests/database/pedidos_v1_constraints.test.sql`.
- [ ] M07: VALIDATE constraints aprovadas; status/prioridade NOT NULL após inventário; `CHECK (frente_id IS NOT NULL)` com Pedido obrigatório nesta fase; restringir Pedido aos três valores. Preservar `responsavel`, `concluido` projetado, `prazo`, comentários antigos e histórico. Não apagar tabela/coluna. Remover só ramo de writer legado do trigger já substituído; mapper tolerante pode ficar para dados de fixture/histórico. Funções privadas e rollout sem USAGE para authenticated.

```sql
ALTER TABLE public.pedidos DROP CONSTRAINT pedidos_status_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_status_check
CHECK (status IN ('Em andamento','Finalizado','Cancelado'));
```

- [ ] GREEN pgTAP e `rtk npm test -- src/lib/pedidos-tarefas/mappers.test.ts`; TS/lint do teste. Verificação: zero inconsistências, contagens preservadas, anexo privado legível/removível pelo fluxo autorizado.
- [ ] Gate IURQ e humano antes de restrição; nenhuma limpeza destrutiva incluída. Se constraint falhar, abortar migration e corrigir dado concreto com aprovação. Aplicativo 1C.2 continua funcional mesmo sem M07. Commit sugerido: `chore: validar integridade da fundacao de pedidos v1`.

## Lote 2 — Tela do Pedido (3 gates, sem migration)

### 2A — Indicadores e próxima ação puros

**Arquivos:** criar `D/indicators.ts`, `D/indicators.test.ts`; modificar `D/task-due.ts` e `D/task-due.test.ts` somente para compartilhar operações de data civil.

**Consome:** TaskV1, Subtask, Dependency e DateKey. **Produz:** `summarizeTasks(tasks:TaskV1[],dependencies:Dependency[],today:DateKey):TaskSummary`; `chooseNextAction(tasks:TaskV1[],today:DateKey):NextAction|null`; `blockedCount(taskId:Id,tasks:TaskV1[],dependencies:Dependency[]):number`; `subtaskProgress(subtasks:Subtask[]):{total:number;completed:number;ready:boolean}`. `TaskSummary={total:number;completed:number;percent:number|null;overdue:number;today:number;waiting:number;followUps:number;blocked:number;readyToFinish:boolean}`; `NextAction={taskId:Id;reason:'overdue'|'today'|'follow_up'|'next_due';date:DateKey;label:string}`.

- [ ] RED: Pedido vazio sem 100%, tarefa concluída fora de contadores ativos, sobreposição espera/atraso/follow-up, dependência concluída deixa de bloquear, empate estável por ID depois de data e prioridade; subtarefas concluídas somente sugerem conclusão.

```ts
expect(summarizeTasks([],[], '2026-09-23').percent).toBeNull();
const tasks=[taskFixture({id:'a',dueDate:'2026-09-22',priority:'Baixa'}),
  taskFixture({id:'b',dueDate:'2026-09-23',priority:'Urgente'})];
expect(chooseNextAction(tasks,'2026-09-23')?.taskId).toBe('a');
expect(tasks[0].priority).toBe('Baixa');
```

- [ ] RED: `rtk npm test -- src/lib/pedidos-tarefas/indicators.test.ts src/lib/pedidos-tarefas/task-due.test.ts`.
- [ ] Implementar comparação civil lexical validada; rank atraso, hoje, follow-up até hoje, próximo prazo. Dentro do rank usar data crescente, prioridade Urgente→Baixa, ID para desempate. Sem datas/regras pendentes não gera próxima ação inventada. Counting é independente, com conjuntos por ID. `readyToFinish = total > 0 && completed === total`. Não filtrar silenciosamente tarefas de Pedido manualmente finalizado: status do Pedido e alertas são dimensões independentes.

```ts
const active = tasks.filter(t => t.status !== 'Concluída');
const overdue = active.filter(t => t.dueDate !== null && t.dueDate < today).length;
const percent = tasks.length === 0 ? null : Math.round(completed * 100 / tasks.length);
```

- [ ] GREEN mesmo comando, casos 31/12→01/01 e meses curtos, TS/lint. Gate IURQ: comparar cálculo com um Pedido vazio e um misto usando dados autorizados, UI anterior continua funcionando. Commit sugerido: `feat: calcular indicadores e proxima acao sem efeitos colaterais`.

### 2B — Consultas focadas, Resumo e navegação preservada

**Arquivos:** criar `D/order-queries.ts`, `D/order-queries.test.ts`, `UI/OrderSummary.tsx`, `UI/OrderTabs.tsx`, `UI/OrderSummary.test.tsx`; modificar `src/app/page.tsx`, `src/components/OrderDrawer.tsx`, `src/components/OrderCard.tsx`, `D/navigation.ts`, `D/navigation.test.ts`.

**Consome:** tipos/mappers/indicadores. **Produz:** `loadOrder(client:SupabaseClient,org:Id,orderId:Id):Promise<OrderV1|null>`, `loadOrderTasks(client,org,orderId):Promise<{fronts:Front[];tasks:TaskV1[];subtasks:Subtask[];dependencies:Dependency[]}>`, `loadOrderRecentActivity(client,org,orderId):Promise<{text:string;at:string;author:string}|null>`; `buildTaskHref(taskId:Id,orderId:Id|null):string`; `resolveOrdersPageIntent` acrescenta `taskId:string|null`, sem remover `orderId/openNewOrder`.

Props: `OrderSummary({order,summary,frontSummaries,nextAction,recent,onOpenTask})`, com `frontSummaries:Array<{front:Front;summary:TaskSummary}>`, recent no formato acima, `onOpenTask:(id:Id)=>void`. `OrderTabs({active,onChange,calendarEnabled})`, active union `'summary'|'tasks'|'updates'|'files'|'calendar'`; calendarEnabled false até 6C.

- [ ] RED: `/?pedido=id` abre Resumo; tarefa com Pedido abre `/?pedido=id&tarefa=tid`; ainda sem Pedido usa `/?tarefa=tid`; erro/fora de tenant não apresenta detalhe stale; consulta de Resumo não seleciona anexos nem chama signed URLs.

```ts
expect(buildTaskHref('t1','p1')).toBe('/?pedido=p1&tarefa=t1');
expect(buildTaskHref('t1',null)).toBe('/?tarefa=t1');
expect(resolveOrdersPageIntent(new URLSearchParams('pedido=p1&tarefa=t1')).taskId).toBe('t1');
```

- [ ] RED: `rtk npm test -- src/lib/pedidos-tarefas/order-queries.test.ts src/lib/pedidos-tarefas/navigation.test.ts src/components/pedidos-tarefas/OrderSummary.test.tsx`.
- [ ] Remover nested select global da lista de Pedidos aos poucos: lista seleciona Pedido e resumo de tarefas, detalhe consulta por org/id; subtarefas/dependências apenas para Pedido aberto. Central e busca mantêm links. Aba Resumo padrão mostra progresso por Frente, próxima ação e atualização recente. Atualizações/Arquivos usam fluxo antigo encapsulado enquanto Lote 5 não acontece; Calendário fica indisponível, sem tela vazia prometendo funcionalidade pronta. Consultar URLs assinadas só na aba/visualização de Arquivos.

```ts
const {data,error}=await client.from('tarefas')
  .select('id,organization_id,pedido_id,frente_id,descricao,descricao_detalhada,status,prioridade,responsavel_user_id,responsavel,vencimento,follow_up_date,waiting_type,waiting_user_id,waiting_note,updated_at,concluida_em,concluido')
  .eq('organization_id',org).eq('pedido_id',orderId);
```

- [ ] GREEN, TS/lint; testar reabertura do drawer, teclado/foco, carregamento/erro/vazio e mudança de organização. Não adicionar cache persistente compartilhado entre tenants.
- [ ] Gate IURQ: navegar Central→Pedido, busca→Pedido, reload de URL, tabs de legado, visualizar PDF/foto e voltar ao Resumo. Aplicativo funcional sem Lote 3/5/6. Commit sugerido: `feat: organizar detalhe de pedido com resumo e consultas focadas`.

### 2C — Frentes, agrupamento e detalhe de tarefa

**Arquivos:** criar `D/fronts.ts`, `D/fronts.test.ts`, `UI/OrderTaskList.tsx`, `UI/FrontEditor.tsx`, `UI/TaskDetailDrawer.tsx`, `UI/TaskSignals.tsx`, `UI/TaskDetailDrawer.test.tsx`, `UI/TaskSignals.test.tsx`; modificar `src/components/OrderDrawer.tsx`, `src/app/page.tsx`, `D/commands.ts` e `D/commands.test.ts`.

**Consome:** leitura de Pedido e comandos 1C; diretório real. **Produz:** `saveFront(client:SupabaseClient,org:Id,front:Front):Promise<WriteResult<Front>>`, `removeFront(client,org,id:Id,destinationId:Id|null):Promise<WriteResult<void>>` via remove_pedido_front, `chooseInitialFront(fronts:Front[],explicitId:Id|null):Id|null`; componentes `OrderTaskList({tasks,fronts,groupBy,onOpenTask})` com groupBy `'stage'|'due'`; `TaskDetailDrawer({taskId,orderId,onClose,onChanged})`; `TaskSignals({task,members,today,lastUpdate,nextAction})` com lastUpdate `{text:string;at:string}|null`, nextAction `NextAction|null`.

- [ ] RED: uma Frente preselecionada, várias exigem escolha, criação dentro da Frente mantém ID, primeira cria Geral; renomear/reordenar persiste; remover Frente com referências falha sem perda; mover tarefa dentro do Pedido preserva ID/notas/subtarefas; checkbox não finaliza Pedido. Leitor de tela diferencia status, urgência e prioridade.

```ts
expect(chooseInitialFront([{id:'f1',orderId:'p1',name:'Geral',position:0}],null)).toBe('f1');
render(<TaskSignals task={taskFixture({status:'Aguardando',priority:'Alta',
  waiting:{type:'customer',userId:null,note:null},dueDate:'2026-09-20'})}
  members={[]} today="2026-09-23" lastUpdate={null} nextAction={null}/>);
expect(screen.getByText('Atrasada há 3 dias')).toBeInTheDocument();
expect(screen.getByText('Aguardando · Cliente')).toBeInTheDocument();
expect(screen.getByText('Prioridade · Alta')).toBeInTheDocument();
```

- [ ] RED: `rtk npm test -- src/lib/pedidos-tarefas/fronts.test.ts src/lib/pedidos-tarefas/commands.test.ts src/components/pedidos-tarefas/TaskDetailDrawer.test.tsx src/components/pedidos-tarefas/TaskSignals.test.tsx`.
- [ ] UI focada: Etapa padrão, alternativa Prazo; form de tarefa título/Frente e campos opcionais, espera condicional com membro real, descrição separada; checkbox, prazo e prioridade de subtarefa; editor simples de predecessoras do mesmo Pedido, mensagens de bloqueio orientativas. Geral vazia pode ser criada na primeira tarefa via RPC existente. Mover tarefa troca Frente, não Pedido; remoção de Frente depende de zerar referências ou mover/desvincular previamente, com FK como proteção final. Atualizações e arquivos futuros referenciarão Frente por RESTRICT. Persistir ordem manual por campo `ordem`, sem drag-and-drop; botões subir/descer.

FrontEditor oferece destino no mesmo Pedido antes de confirmar remoção da Frente com tarefas; chama removeFront uma única vez, sem loop de updates independentes. O texto de confirmação informa quais referências serão movidas/desvinculadas nos lotes seguintes. Desvincular Frente de tarefa vinculada a Pedido nunca é permitido: deve haver Frente de destino.

```tsx
<section aria-label="Sinais operacionais">
  <span aria-label="Status da tarefa">{task.status}</span>
  <span>Prioridade · {task.priority}</span>
  <span>Responsável · {assigneeLabel}</span>
</section>
```

`assigneeLabel` resolve Member por ID ou nome legado com indicação de identidade pendente; urgência, espera, follow-up, atualização e próxima ação são textos separados. Cores reforçam, mas não carregam significado sozinhas. Reutilizar o mesmo componente na Central no Lote 3.

- [ ] GREEN, TS/lint; erros RPC mantêm form editável, confirmar conclusão com dependência/subtarefa aberta informa consequência e permite ação explícita (não cria bloqueio obrigatório). Atualizações continuam no fluxo legado até 5C.
- [ ] Gate IURQ: criar/renomear/mover/remover Frente, editar tarefa e subtarefa, marcar tudo sem auto-finalizar, finalizar/reabrir com confirmação. Commit sugerido: `feat: editar frentes e tarefas com sinais operacionais separados`.

## Lote 3 — Dashboard operacional (2 gates)

### 3A — Liberar tarefa avulsa e adaptar leituras existentes

**Arquivos:** criar M08, `DBT/pedidos_v1_quick_tasks.test.sql`, `supabase/verification/pedidos-v1-quick-tasks.sql`, `D/task-notes.ts`, `D/task-notes.test.ts`; modificar `D/commands.ts`, `D/commands.test.ts`, `src/types/index.ts`, `UI/TaskDetailDrawer.tsx`, `src/lib/central/operational.ts`, `src/lib/central/operational.test.ts`, `src/lib/central/queries.ts`, `src/lib/central/queries.test.ts`, `src/lib/central/view.ts`, `src/lib/central/view.test.ts`, `src/lib/central/search.ts`, `src/lib/central/search.test.ts`, `D/navigation.test.ts`.

**Consome:** comandos/TaskV1 já aceitam orderId nullable no contrato, mas rejeitam até esta fase. **Produz:** mesma tarefa com par Pedido/Frente nulo; leituras da Central e busca tolerantes a avulsas. RPC `create_pedido_task` aceita avulsa com assignee válido explícito. Resolução de Thomás é cliente via `resolveNamedMember`; RPC não contém nome de pessoa.

- [ ] RED: criar avulsa com null/null; rejeitar null/frente e pedido/null; membro de outro tenant falha; sem responsável falha; avulsa não entra em dependências; Central não manda null para `.in('id',orderIds)` e não perde cobranças/locações; notas continuam em comentarios_tarefa.

```ts
expect(buildTaskHref('quick-1',null)).toBe('/?tarefa=quick-1');
expect(resolveNamedMember([{userId:'u1',displayName:'Thomás'}],'Thomás')).toBe('u1');
expect(resolveNamedMember([],'Thomás')).toBeNull();
```

- [ ] RED: `rtk proxy supabase test db supabase/tests/database/pedidos_v1_quick_tasks.test.sql`; `rtk npm test -- src/lib/pedidos-tarefas/commands.test.ts src/lib/central/operational.test.ts src/lib/central/queries.test.ts src/lib/central/view.test.ts src/lib/central/search.test.ts src/lib/pedidos-tarefas/navigation.test.ts`.
- [ ] Primeiro preparar leitores nullable e disponibilizar build compatível; depois aplicar M08 aprovada. Remover NOT NULL de pedido_id e CHECK absoluto de Frente; adicionar par coerente. Manter FK tripla quando há Pedido; avulsa não tem Frente. Alterar RPC para tratar lock de tarefa sem Pedido; sem funcionalidade de vincular depois. Índices `(organization_id,status,vencimento)`, `(organization_id,status,follow_up_date)` e responsável servem ambas. Não copiar tarefas a outra tabela.

M08 acrescenta `comentarios_tarefa.event_type text null`, somente como metadado de origem operacional. A rotina privada record_pedido_task_event de M05, quando tarefa é avulsa, escreve registro de sistema nessa mesma tabela de notas legada com event_type; não tenta INSERT em atividades com pedido_id null antes do Lote 5. Notas humanas mantêm event_type null. Guard impede API direta de forjar event_type ou excluir registro system isoladamente; UI distingue sistema e não oferece exclusão desses registros. Não criar terceira fonte de atualizações. Ajustar leitor de última manual para ignorar event_type não nulo; M12 preservará esses registros como system. Testar concluir/reabrir/alterar espera de avulsa antes do Lote 5. Os callbacks atuais de nota dependem de orderId e de setOrders: extrair já em 3A `D/task-notes.ts` e `D/task-notes.test.ts`, interfaces `listTaskNotes(client:SupabaseClient,org:Id,taskId:Id):Promise<ComentarioTarefa[]>`, `addTaskNote(client,org,taskId,text:string):Promise<WriteResult<Id>>`, `deleteTaskNote(client,org,noteId:Id):Promise<WriteResult<void>>`, e modificar `UI/TaskDetailDrawer.tsx`. Refetch por taskId substitui dependência de Pedido. Estender `ComentarioTarefa` em `src/types/index.ts` com `event_type?:string|null`. Incluir esses arquivos no escopo e executar `rtk npm test -- src/lib/pedidos-tarefas/task-notes.test.ts` no RED/GREEN de 3A. Em 5C essas mesmas interfaces delegam à timeline conforme capability; não manter writers legados ativos em v1.

```sql
CHECK ((pedido_id IS NULL AND frente_id IS NULL)
    OR (pedido_id IS NOT NULL AND frente_id IS NOT NULL))
```

- [ ] GREEN ambos comandos, TS/lint. Verificação SQL conta avulsas, pares inconsistentes e arestas envolvendo avulsa, estes dois últimos zero. Recuperação mantém leitores nullable; não reaplicar NOT NULL enquanto existirem avulsas, nem excluí-las.
- [ ] Gate IURQ: criar via RPC de QA, abrir detalhe por URL, adicionar nota pelo fluxo legado e preservar seções financeiras. Commit sugerido: `feat: suportar tarefas avulsas na estrutura existente`.

### 3B — Quatro filas, filtros reais e criação rápida

**Arquivos:** criar `D/dashboard.ts`, `D/dashboard.test.ts`, `D/dashboard-queries.ts`, `D/dashboard-queries.test.ts`, `UI/OperationalTaskCard.tsx`, `UI/QuickTaskForm.tsx`, `UI/OperationalDashboard.tsx`, `UI/OperationalDashboard.test.tsx`; modificar `src/app/hub/page.tsx`, `src/lib/central/queries.ts`, `src/lib/central/operational.ts` e testes, `src/app/page.tsx` para detalhe direto de avulsa.

**Consome:** TaskSignals, membros, navegação, comandos, TaskSummary e dados financeiros atuais. **Produz:** `loadDashboardTasks(client:SupabaseClient,org:Id,today:DateKey,filter:TaskFilter):Promise<DashboardTask[]>`, `buildTaskQueues(tasks:DashboardTask[],today:DateKey):TaskQueues`. `TaskFilter={assigneeId?:Id;waitingType?:WaitingType}`; `DashboardTask={task:TaskV1;order:{number:string;client:string}|null;lastUpdate:{text:string;at:string}|null}`; `TaskQueues={overdue:DashboardTask[];today:DashboardTask[];followUps:DashboardTask[];waiting:DashboardTask[]}`. `OperationalDashboard({queues,members,today,onOpenTask,onCreateQuick})`; QuickTaskForm resolve default org único ou solicita escolha.

- [ ] RED: tarefa aguardando Cliente e atrasada com follow-up hoje aparece em três filas; concluída nenhuma; Minhas compara auth ID; erro de consulta não aparece como “tudo em dia”; lastUpdate ausente é Não registrada. Componentes exibem oito dimensões e contexto de avulsa, ação abre tarefa exata.

```ts
const item:DashboardTask={task:taskFixture({dueDate:'2026-09-20',followUpDate:'2026-09-23',
  status:'Aguardando',waiting:{type:'customer',userId:null,note:null}}),order:null,lastUpdate:null};
const q=buildTaskQueues([item],'2026-09-23');
expect([q.overdue.length,q.today.length,q.followUps.length,q.waiting.length]).toEqual([1,0,1,1]);
```

- [ ] RED: `rtk npm test -- src/lib/pedidos-tarefas/dashboard.test.ts src/lib/pedidos-tarefas/dashboard-queries.test.ts src/components/pedidos-tarefas/OperationalDashboard.test.tsx src/lib/central/queries.test.ts src/lib/central/operational.test.ts`.
- [ ] Consultar apenas tarefas ativas relevantes: prazo <= hoje OU follow-up <= hoje OU status Aguardando; filtrar org e assignee/waiting. Para card “próxima ação”, usar regra da tarefa exibida; Resumo continua calculando próxima do Pedido completo. Carregar Pedido/cliente e última nota por IDs em lotes, sem anexos/URLs. Até 5C, última atualização combina nota manual da tarefa (`comentarios_tarefa`) e atividade manual do Pedido; atividades de sistema identificadas não contam como manual. Fallback `updatedAt`; legado sem data mostra Não registrada. Após 5C substituir fonte de nota por atividades canônicas, sem manter ambos os writers.

```ts
const active=items.filter(({task})=>task.status!=='Concluída');
return {
  overdue:active.filter(({task})=>task.dueDate!==null && task.dueDate<today),
  today:active.filter(({task})=>task.dueDate===today),
  followUps:active.filter(({task})=>task.followUpDate!==null && task.followUpDate<=today),
  waiting:active.filter(({task})=>task.status==='Aguardando')
};
```

- [ ] Unificar seção operacional de tarefas da Central com as quatro filas; não deixar seção antiga duplicada. Preservar integralmente consultas/seções financeiras. QuickTaskForm só exige título e responsável resolvido, null/null no payload; notas reutilizam detalhe existente. Não criar vínculo tardio com Pedido.
- [ ] GREEN, TS/lint; teste financeiro anterior deve permanecer verde. Gate IURQ: criar rápida, trocar responsável, sem Thomás escolher membro, testar Minhas e filtros, sobreposição, atualização sem data, detalhe e retorno. Commit sugerido: `feat: evoluir central com filas operacionais e tarefa rapida`.

## Lote 4 — Templates (3 gates)

### 4A — Blueprint validado, versionado e datas civis

**Arquivos:** criar M09, `D/template-schema.ts`, `D/template-schema.test.ts`, `D/template-dates.ts`, `D/template-dates.test.ts`, `DBT/pedidos_v1_templates.test.sql`, `supabase/verification/pedidos-v1-templates.sql`; modificar `D/types.ts`, `D/mappers.ts`, `D/mappers.test.ts`, `D/order-queries.ts`, `D/order-queries.test.ts`.

**Consome:** tipos V1, DateKey e funções de data locais existentes. **Produz:** `TemplateDefinition` e Zod `templateDefinitionSchema`; `addCalendarDays(date:DateKey,n:number):DateKey`; `pedido_templates(id,organization_id,nome,version,definition jsonb,created_at,updated_at,created_by)` e metadados de instância/regra. Sem UI antes de 4B; app atual permanece igual.

```ts
export type DateRule = {kind:'creation';offsetDays:number} |
  {kind:'completion';sourceTaskKey:string;offsetDays:number};
export type TemplateDefinition = {
  schemaVersion:1;
  fronts:Array<{key:string;name:string;position:number}>;
  tasks:Array<{key:string;frontKey:string;title:string;description:string|null;
    priority:TaskPriority;dueRule:DateRule|null;followUpRule:DateRule|null}>;
  subtasks:Array<{key:string;taskKey:string;title:string;priority:TaskPriority|null;dueRule:DateRule|null}>;
  dependencies:Array<{taskKey:string;predecessorKey:string}>;
};
export type InstanceDateRule = {sourceTaskId:Id;offsetDays:number;timeZone:string;
  state:'pending'|'materialized'|'overridden';materializedAt:string|null};
```

InstanceDateRule fica em `D/types.ts`; DateRule/TemplateDefinition e schema Zod ficam em `D/template-schema.ts`, usando imports de tipos, sem dependência circular em runtime.

- [ ] RED: referência faltante, chave duplicada, ciclo de dependência e ciclo de regras de conclusão rejeitados, offset inteiro não negativo; D+0, fim de mês/ano e ano bissexto; isolamento e blueprint inválido rejeitado também no banco.

O pgTAP de 4A também afirma `has_table_privilege('authenticated','public.pedido_templates','SELECT') = true`, `TRUNCATE/INSERT/UPDATE/DELETE = false` e nenhum privilégio novo de anon; isso falha no default herdado anterior à neutralização.

```ts
expect(addCalendarDays('2026-12-31',1)).toBe('2027-01-01');
expect(addCalendarDays('2028-02-28',1)).toBe('2028-02-29');
expect(addCalendarDays('2026-09-23',0)).toBe('2026-09-23');
expect(templateDefinitionSchema.safeParse({schemaVersion:1,fronts:[],tasks:[
  {key:'a',frontKey:'missing',title:'A',description:null,priority:'Normal',dueRule:null,followUpRule:null}
],subtasks:[],dependencies:[]}).success).toBe(false);
```

- [ ] RED: `rtk npm test -- src/lib/pedidos-tarefas/template-schema.test.ts src/lib/pedidos-tarefas/template-dates.test.ts src/lib/pedidos-tarefas/mappers.test.ts src/lib/pedidos-tarefas/order-queries.test.ts`; `rtk proxy supabase test db supabase/tests/database/pedidos_v1_templates.test.sql`.
- [ ] M09: imediatamente após criar `public.pedido_templates`, `REVOKE ALL` de PUBLIC, anon e authenticated; conceder somente SELECT a authenticated com RLS por organização; writes posteriores via RPC de 4B, não por default grants. Testar grants efetivos, em especial authenticated sem TRUNCATE e anon sem acesso. Unique `(organization_id,id)`. Função privada `validate_pedido_template(definition jsonb) returns void` valida mesma estrutura/IDs/grafo que Zod (asserts de paridade no pgTAP); usar trigger para rejeitar dados inválidos. Em tarefas adicionar `vencimento_rule jsonb`, `follow_up_rule jsonb`; em subtarefas `vencimento_rule jsonb`; null nos existentes. Regras de criação viram data na instância, não permanecem como outra fonte ativa. Regra completion persiste no formato InstanceDateRule e valida sourceTaskId na mesma org/Pedido por trigger (JSON não tem FK declarativa). Bloquear exclusão da tarefa origem enquanto há regra pendente; regra materializada mantém proveniência sem recalcular. Acrescentar `pedidos.template_id`, `template_version`, `template_request_id uuid`, unique parcial `(organization_id,template_request_id)`, FK template na mesma org, sem copiar Pedido.

Guard de exclusão de origem pendente é aplicado a remoção individual de tarefa; exclusão explícita de todo Pedido sem anexos remove seus filhos conjuntamente. Testar esse caminho para não quebrar exclusão atual do Pedido. Nenhuma regra pode referenciar fonte avulsa ou outro Pedido. O contrato das regras passa a integrar leitura: acrescentar opcionalmente `dueRule?:InstanceDateRule|null` em TaskV1/Subtask e `followUpRule?:InstanceDateRule|null` em TaskV1; `D/mappers.ts` e `D/order-queries.ts` passam a selecioná-los após M09, com testes nesses arquivos. Preparar build posterior à expansão, e incluir esses quatro arquivos de código/teste no escopo de 4A. Sem regra, ausência/null têm a mesma semântica; nenhuma outra data operacional nasce nesses campos.

```ts
export function addCalendarDays(date:DateKey,n:number):DateKey {
  const [year,month,day]=date.split('-').map(Number);
  const result=new Date(Date.UTC(year,month-1,day+n));
  return result.toISOString().slice(0,10);
}
```

- [ ] GREEN, TS/lint; verificação SQL de JSONs inválidos, referências pendentes cruzadas, índices/RLS/grants. Recovery: manter colunas null e templates não expostos; não remover definição já salva. Gate humano/IURQ após M09, app anterior íntegro. Commit sugerido: `feat: definir blueprints de pedidos e regras de datas civis`.

### 4B — Instanciação atômica, edição e duplicação

**Arquivos:** criar M10, `D/templates.ts`, `D/templates.test.ts`, `UI/TemplateEditor.tsx`, `UI/TemplatePicker.tsx`, `UI/TemplateEditor.test.tsx`, `DBT/pedidos_v1_template_instance.test.sql`, `supabase/verification/pedidos-v1-template-instance.sql`; modificar `src/components/NewOrderDrawer.tsx`, `scripts/tests/pedidos-concurrency.mjs`.

**Consome:** TemplateDefinition, validação e comandos. **Produz:** `TemplateRecord={id:Id;name:string;version:number;definition:TemplateDefinition}`; `listTemplates(client:SupabaseClient,org:Id):Promise<TemplateRecord[]>`; `saveTemplate(client,org,input:{id:Id|null;name:string;expectedVersion:number|null;definition:TemplateDefinition}):Promise<WriteResult<TemplateRecord>>`; `duplicateTemplate(client,org,id:Id,name:string):Promise<WriteResult<TemplateRecord>>`; `instantiateTemplate(client,org,input:{templateId:Id;expectedVersion:number;requestId:Id;order:OrderInput;timeZone:string}):Promise<WriteResult<Id>>`.

RPCs: `save_pedido_template(p_org uuid,p_input jsonb) returns jsonb`, `duplicate_pedido_template(p_org uuid,p_id uuid,p_name text) returns jsonb`, `instantiate_pedido_template(p_org uuid,p_input jsonb) returns uuid`. Validação de timezone IANA via `pg_timezone_names`; data local de criação deriva de timestamp do servidor nesse fuso, não data livre do navegador.

- [ ] RED: instância cria novos IDs em todos os níveis e remapeia dependência/regra; falha de uma subtarefa reverte tudo; requisição repetida retorna mesmo Pedido, duas simultâneas não duplicam; edição versão antiga dá conflito; alterar blueprint não muda instância; tenant alheio falha.

```sql
SELECT has_function('public','instantiate_pedido_template',ARRAY['uuid','jsonb']);
SELECT ok(NOT has_table_privilege('authenticated','public.pedido_templates','UPDATE'));
-- Após duas chamadas com mesmo requestId na fixture: count(pedidos.template_request_id)=1.
-- Após erro injetado na última subtarefa: contagens de Pedido/Frente/tarefa iguais ao início.
```

- [ ] RED: `rtk npm test -- src/lib/pedidos-tarefas/templates.test.ts src/components/pedidos-tarefas/TemplateEditor.test.tsx`; `rtk proxy supabase test db supabase/tests/database/pedidos_v1_template_instance.test.sql`; `rtk proxy node scripts/tests/pedidos-concurrency.mjs template-request`.
- [ ] M10: transação única, membership, version check, UUID map de keys→novos IDs; insert Pedido sem Geral automática desnecessária, inserir Frentes/tarefas/subtarefas e depois arestas/regras. Assignee das tarefas geradas default criador autenticado; nenhuma pessoa gravada no template obrigatório. Datas creation usam `local_creation_date + offsetDays`. Limpar status/espera/conclusão na instância nova para Aberta/Normal ou prioridade sugerida. requestId reutilizado só com mesmo template/version/payload: persistir hash de entrada em `pedidos.template_request_fingerprint text` nesta migration; payload diferente com mesmo ID gera conflito.

```sql
-- Dentro da mesma transação; o índice único resolve a disputa do requestId.
v_local_date := (transaction_timestamp() AT TIME ZONE v_timezone)::date;
v_due_date := v_local_date + v_offset_days;
-- Remapear sourceTaskKey para UUID da instância antes de persistir regra pendente.
```

- [ ] UI Novo Pedido oferece Em branco (fluxo existente) ou template; gerenciar via painel simples com criar/editar/duplicar, sem rota/módulo paralelo. Editor de listas Frentes/tarefas/subtarefas/dependências e regras; salvar só blueprint válido; conflito pede recarregar preservando rascunho. Regras após conclusão ficam descritas como pendentes, mas sua execução ainda será habilitada em 4C: até lá impedir salvar/instanciar template que use completion na UI/RPC com erro claro; templates somente D+n funcionam neste gate.
- [ ] GREEN, TS/lint; SQL verifica contagens/remapeamento por organização, nenhum Pedido parcial. Recovery mantém instâncias; desabilitar nova instanciação se regressão, sem excluir Pedidos. Gate IURQ: branco, duplicar, editar, criar, retry, D+n e independência. Commit sugerido: `feat: instanciar templates de pedido em transacao unica`.

### 4C — Materializar regras após primeira conclusão

**Arquivos:** criar M11, `DBT/pedidos_v1_relative_dates.test.sql`, `supabase/verification/pedidos-v1-relative-dates.sql`; modificar `D/template-dates.ts`, `D/template-dates.test.ts`, `D/commands.ts`, `D/commands.test.ts`, `UI/TemplateEditor.tsx`, `UI/TaskDetailDrawer.tsx`, `UI/TaskDetailDrawer.test.tsx`, `scripts/tests/pedidos-concurrency.mjs`.

**Consome:** InstanceDateRule, RPC de update tarefa/subtarefa, timezone da instância. **Produz:** função privada `materialize_pedido_completion_rules(p_org uuid,p_source uuid,p_completed_at timestamptz) returns void`, chamada pela transição explícita para Concluída; `pendingRuleLabel(rule:InstanceDateRule,sourceTitle:string):string` para datas ainda pendentes. Retirar bloqueio temporário de regras completion em 4B.

- [ ] RED: fonte concluída hoje+N materializa tarefa e subtarefa; reabrir e reconcluir não muda data; limpar/editar prazo manual antes de fonte concluir vence; edição manual concorrente vence ao adquirir lock, sem sobrescrita posterior; fuso -03 perto da meia-noite usa dia correto; materialização não gera cascata de conclusões.

```sql
-- Cenário fixture: fonte conclui em 2026-10-01 01:00Z, America/Sao_Paulo, offset 1.
-- Data esperada: 2026-10-01 (conclusão local em 30/09), não 02/10.
SELECT is(('2026-10-01 01:00:00+00'::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date + 1,
  '2026-10-01'::date);
```

- [ ] RED: `rtk proxy supabase test db supabase/tests/database/pedidos_v1_relative_dates.test.sql`; `rtk npm test -- src/lib/pedidos-tarefas/template-dates.test.ts src/lib/pedidos-tarefas/commands.test.ts src/components/pedidos-tarefas/TaskDetailDrawer.test.tsx`; `rtk proxy node scripts/tests/pedidos-concurrency.mjs manual-relative-date`.
- [ ] M11: serializar alterações de tarefa/regra pelo lock do Pedido, mesma ordem de locks em todos RPCs. Só `state='pending'` recebe cálculo; `materializedAt` fica persistido. Qualquer campo de data presente no PATCH, inclusive null, marca regra correspondente `overridden`. Ausência do campo não é alteração manual. Ao concluir fonte, gravar data e marcar materialized atomicamente; nunca guardar duas datas concorrentes para prazo ativo. Alteração manual depois de materialização muda coluna fonte, mantém proveniência. Novo índice expressional parcial sourceTaskId para busca de pendentes, por org. Triggers/funcões privadas sem execute público.

```ts
const manualDueChange=Object.prototype.hasOwnProperty.call(patch,'dueDate');
// Espelhar esta distinção no JSONB recebido pelo RPC: p_patch ? 'dueDate'.
```

- [ ] GREEN, TS/lint; verificação SQL retorna regras pending inválidas, materialized sem data/proveniência e referências cruzadas (zero); overridden pode ter data null, corretamente. Recovery suspende novas materializações até corrigir, sem recalcular materialized/overridden. Gate IURQ: concluir/reabrir/editar manual e instanciar template completo. Commit sugerido: `feat: materializar prazos relativos uma unica vez`.

## Lote 5 — Timeline + Arquivos (4 gates)

### 5A — Expandir atividades e capturar deltas do legado

**Arquivos:** criar M12, `DBT/pedidos_v1_timeline_expand.test.sql`, `supabase/verification/pedidos-v1-timeline-expand.sql`; modificar `supabase/tests/helpers/pedidos-v1-fixtures.sql`, `D/order-queries.ts`, `D/order-queries.test.ts`, `D/dashboard-queries.ts`, `D/dashboard-queries.test.ts`.

**Consome:** atividades e comentários existentes, rollout privado, tarefas avulsas. **Produz:** `atividades.tipo ('manual'|'system')`, `frente_id`, `tarefa_id`, `source_comment_id`, `event_type` e `follow_up_date` (snapshot informativo do follow-up aplicado à tarefa na mesma transação); pedido_id nullable somente com tarefa. `source_comment_id` unique parcial por organização é proveniência, sem FK cascade ao comentário antigo. Reusar `user_id`, `usuario`, `descricao`, `criado_em`, `migration_key`; não criar nova tabela de timeline.

- [ ] RED: comentário novo após início da cópia gera uma atividade derivada, com autor/hora/texto iguais; repetir evento de cópia não duplica; excluir nota durante fase legacy retira somente sua projeção. Nota avulsa projeta atividade null Pedido com tarefa obrigatória; vínculo de tarefa/Pedido cruzado falha; escrita direta não pode forjar system.

```sql
SELECT has_column('public','atividades','source_comment_id');
SELECT col_is_null('public','atividades','pedido_id');
SELECT is((SELECT count(*)::int FROM public.atividades
  WHERE pedido_id IS NULL AND tarefa_id IS NULL),0);
```

- [ ] RED: `rtk proxy supabase test db supabase/tests/database/pedidos_v1_timeline_expand.test.sql`.
- [ ] Preparar leitor compatível antes de aplicar M12: capability legacy não seleciona/filtra source_comment_id inexistente; capability copying passa a excluir cópias da lista antiga de atividades. M12 expande e muda timelineMode para copying atomicamente; a fonte de escrita permanece legada. Atividades antigas manuais viram tipo manual; `migration_key` de transição/sistema vira system. FK tarefa por `(organization_id,tarefa_id)` e trigger de coerência Pedido/Frente/tarefa, FK Frente tripla; `CHECK(pedido_id IS NOT NULL OR tarefa_id IS NOT NULL)`. Enquanto apenas projeções recebem tarefa_id, FK permite cascade de projeções junto da exclusão legada de tarefa/notas; M14 substitui pela proteção do histórico canônico. Manter RLS por organização. Copiador privado dispara em INSERT/DELETE de comentarios_tarefa durante timelineMode copying; é derivação de migração, sem edição independente nem leitura dupla na UI. Escrever source_comment_id único com ON CONFLICT DO NOTHING; propagar remoção enquanto legado canônico. Guard de atividades rejeita insert system/source_comment_id por API direta; somente rotina privada de projeção e comandos autenticados internos podem criá-los. Nada é liberado por parâmetro booleano fornecido pelo cliente.

```sql
INSERT INTO public.atividades(organization_id,pedido_id,tarefa_id,descricao,usuario,user_id,
  criado_em,tipo,source_comment_id)
SELECT c.organization_id,t.pedido_id,t.id,c.texto,c.usuario,c.user_id,c.criado_em,'manual',c.id
FROM public.comentarios_tarefa c JOIN public.tarefas t
ON t.organization_id=c.organization_id AND t.id=c.tarefa_id
WHERE c.id=p_comment_id
ON CONFLICT (organization_id,source_comment_id) WHERE source_comment_id IS NOT NULL DO NOTHING;
```

Se comentario tem event_type operacional da fase avulsa, copiar tipo system e event_type correspondente, sem classificar pelo texto. A projeção não deve duplicar entrada em Atualizações antes de 5C: no modo copying, leitor exclui `source_comment_id IS NOT NULL` da lista de atividades do Pedido; notas continuam sendo lidas de comentarios_tarefa. Para a pequena janela entre leitura da capability e aplicação de M12, o leitor compatível em legacy usa `select('*')` somente na consulta focal de atividades do Pedido, filtra no mapper qualquer source_comment_id não nulo retornado, e busca a próxima página se necessário. A coluna ainda ausente não aparece no payload e é tratada como null. Assim não envia filtro por coluna inexistente nem exibe cópia por usar capability antiga; atualizar capability na próxima consulta.

- [ ] GREEN pgTAP e `rtk npm test -- src/lib/pedidos-tarefas/order-queries.test.ts src/lib/pedidos-tarefas/dashboard-queries.test.ts`; SQL verifica deltas e identidade autor/hora, nenhum cross-tenant. TS/lint para filtros de leitura. O teste de consultas em modo legacy assegura ausência da coluna nova no SQL enviado.
- [ ] Gate humano/IURQ: comentário e atividade funcionam no app anterior, sem duplicação visual. Recovery: manter schema, desativar copiador problemático e reconciliar antes de continuar, nunca habilitar writer novo parcial. Commit sugerido: `feat: preparar atividades como timeline canonica`.

### 5B — Backfill verificável de comentários

**Arquivos:** criar M13, `DBT/pedidos_v1_timeline_backfill.test.sql`, `supabase/verification/pedidos-v1-timeline-backfill.sql`.

**Consome:** captura de deltas validada em 5A. **Produz:** cópia integral de comentários válidos em atividades, sem mudar fonte de escrita ainda.

- [ ] RED: duas execuções mantêm mesma quantidade; empate de timestamp ordena por ID; user_id nulo preserva usuario legível; nota avulsa copiada; nota sem tarefa gera inventário bloqueante antes da cópia, não desaparece por inner join.

```sql
SELECT is((SELECT count(*)::int FROM public.comentarios_tarefa c
  LEFT JOIN public.atividades a ON a.organization_id=c.organization_id AND a.source_comment_id=c.id
  WHERE a.id IS NULL),0);
SELECT is((SELECT count(*)::int FROM public.comentarios_tarefa c
  JOIN public.atividades a ON a.organization_id=c.organization_id AND a.source_comment_id=c.id
  WHERE (a.descricao,a.usuario,a.user_id,a.criado_em)
    IS DISTINCT FROM (c.texto,c.usuario,c.user_id,c.criado_em)),0);
```

- [ ] RED: `rtk proxy supabase test db supabase/tests/database/pedidos_v1_timeline_backfill.test.sql`.
- [ ] M13 chama o mesmo copiador privado para cada nota após inventário, dentro de transação; preservar timestamp original inclusive se vazio histórico exigir investigação. Bloquear avanço se nota sem tarefa não tiver associação recuperável; não usar Pedido fictício. Deltas continuam capturados, exclusão de legado elimina cópia até o cutover. Testar sequência copiar→excluir e inserir→copiar (sem ressurreição/duplicação), com locks apropriados da linha de comentário.

```sql
SELECT c.id FROM public.comentarios_tarefa c
LEFT JOIN public.tarefas t ON t.organization_id=c.organization_id AND t.id=c.tarefa_id
WHERE t.id IS NULL; -- deve estar vazio antes de M13
```

- [ ] GREEN pgTAP; relatório de contagens/chaves/hash de conteúdo e divergências zero, sem conteúdo sensível em logs. TS/lint não aplicável. Recovery antes de cutover conserva legado intacto; corrigir somente projeções identificadas por source_comment_id, nunca atividades nativas.
- [ ] Gate IURQ: usuário revisa amostras cronológicas antigas, autores sem ID e avulsas. App legado pode continuar indefinidamente nesta fase com copiador. Commit sugerido: `data: incorporar notas antigas sem duplicar historico`.

### 5C — Trocar leitura/escrita da timeline e relacionar anexos

**Arquivos:** criar M14, `D/timeline.ts`, `D/timeline.test.ts`, `D/attachments.ts`, `D/attachments.test.ts`, `DBT/pedidos_v1_timeline_activate.test.sql`, `supabase/verification/pedidos-v1-timeline-activate.sql`; modificar `D/commands.ts`, `D/task-notes.ts`, `D/task-notes.test.ts`, `D/dashboard-queries.ts`, `D/dashboard-queries.test.ts`, `D/order-queries.ts`, `src/app/page.tsx`, `src/components/OrderDrawer.tsx`, `UI/TaskDetailDrawer.tsx`.

**Consome:** cópia conferida, arquivos/bucket atuais e capabilities. **Produz:** `TimelineEntry={id:Id;orderId:Id|null;frontId:Id|null;taskId:Id|null;kind:'manual'|'system';text:string;authorId:Id|null;authorName:string;at:string;followUpDate:DateKey|null}`; `loadTimeline(client:SupabaseClient,org:Id,scope:{orderId:Id}|{taskId:Id}):Promise<TimelineEntry[]>`; `addUpdate(client,org,input:{orderId:Id|null;frontId:Id|null;taskId:Id|null;text:string;followUpDate?:DateKey|null}):Promise<WriteResult<Id>>`; `deleteUpdate(client,org,id:Id):Promise<WriteResult<void>>`. Follow-up só se taskId informado; não cria follow-up de Pedido/Frente paralelo.

RPCs `add_pedido_update(p_org uuid,p_input jsonb) returns uuid`, `delete_pedido_update(p_org uuid,p_id uuid) returns void`; `list_pedido_timeline(p_org uuid,p_order uuid,p_task uuid) returns setof atividades` com validação de exatamente um escopo. `AttachmentContext={orderId:Id;frontId:Id|null;taskId:Id|null;updateId:Id|null}`; `listOrderAttachments(client,org,orderId):Promise<Anexo[]>`, aproveita Anexo existente expandido.

- [ ] RED: nenhuma nota nova entra em comentarios_tarefa após cutover; busca por Pedido inclui atividade via tarefa sem duplicar; atualização com follow-up altera a mesma `tarefas.follow_up_date` atomicamente; sem tarefa + follow-up falha; usuário não forja autor/system; attachment cross-Pedido/tenant falha inclusive se parent IDs existem; delete metadata/objeto mantém ordem protegida.

```sql
SELECT ok(NOT has_table_privilege('authenticated','public.comentarios_tarefa','INSERT'));
SELECT ok(NOT has_table_privilege('authenticated','public.comentarios_tarefa','DELETE'));
SELECT ok(NOT has_table_privilege('authenticated','public.atividades','INSERT'));
```

- [ ] RED: `rtk proxy supabase test db supabase/tests/database/pedidos_v1_timeline_activate.test.sql`; `rtk npm test -- src/lib/pedidos-tarefas/timeline.test.ts src/lib/pedidos-tarefas/task-notes.test.ts src/lib/pedidos-tarefas/attachments.test.ts src/lib/pedidos-tarefas/dashboard-queries.test.ts src/lib/pedidos-tarefas/attachment-deletion.test.ts`.
- [ ] Preparar build com adapter único dependente da capability: legacy/copying enviam nota a comentarios_tarefa/atividade conforme contexto; v1 só usa RPC atividade. Antes de M14, não expor vínculos de arquivo/follow-up indisponíveis. M14 adiciona a anexos `frente_id/tarefa_id/atividade_id` null, FKs compostas e trigger que valida coerência do conjunto com Pedido (não apenas organização); índices por contexto; caminho do storage permanece org/Pedido/arquivo. Não alterar permissões do bucket. Adicionar RPCs e, na mesma transação, travar comentários, reconciliar última diferença, remover copiador, revogar writes de comentarios e diretos de atividades, substituir cascade de atividade→tarefa por NO ACTION, mudar timelineMode v1. Não apagar tabela antiga.

```sql
-- Núcleo da leitura canônica de Pedido: OR evita UNION duplicando o mesmo evento.
SELECT a.* FROM public.atividades a
LEFT JOIN public.tarefas t ON t.organization_id=a.organization_id AND t.id=a.tarefa_id
WHERE a.organization_id=p_org AND (a.pedido_id=p_order OR t.pedido_id=p_order)
ORDER BY a.criado_em DESC,a.id DESC;
```

Banco valida org do pedido/tarefa em cada chamada, mesmo RPC definer. addUpdate deriva autor de auth.uid/diretório, grava tipo manual e, se campo followUpDate presente, usa mesma rotina de alteração manual de 4C para prevalecer sobre regra. Sistemas registram conclusão/reabertura/finalização/espera em atividades na mesma transação da mudança; não registrar toda edição trivial. No dashboard, última manual relevante é a mais recente da tarefa OU Frente OU Pedido; fallback updatedAt; empate ID. Snapshot follow_up_date em atividade é histórico, nunca lido como prazo ativo.

Exclusões: Frente com referência requer mover/desvincular contexto primeiro; não apagar histórico em cascade. Tarefa de Pedido com atividade pode ser removida após desvincular referência da tarefa preservando pedido_id e texto de contexto; anexos também preservam Pedido. Atividade de avulsa não pode perder a última âncora: remoção da tarefa é recusada enquanto houver histórico referenciado, com mensagem explícita, sem apagamento silencioso. DELETE de Pedido mantém proteção de anexos existente. Não implementar soft-delete geral.

M14 estende remove_pedido_front: com destino, mover tarefas e frente_id dos contextos associados; sem destino, exigir ausência de tarefas e limpar somente frente_id opcional em atividades/anexos, preservando Pedido/Tarefa/texto/arquivo. Tudo numa transação após confirmação; nenhuma caixa extra de histórico. deleteUpdate só exclui atualização manual e primeiro limpa atividade_id dos anexos preservando os arquivos no Pedido; não desfaz follow-up atual por apagar seu registro histórico. Ajustar testes de removeFront e deleteUpdate para essas duas transações. A rotina record_pedido_task_event passa a escrever exclusivamente em atividades, inclusive para avulsa; não continuar gravando comentarios após M14.

- [ ] GREEN, TS/lint. SQL verifica zero notas sem cópia, sources únicos, coerência de vínculos e grants fechados. Recovery: usar build compatível com capability v1 e corrigir para frente; não religar writer legado após novas atividades nativas.
- [ ] Gate IURQ separado para cutover M14: notas, follow-up atômico, arquivo contextual, erro de autorização, ausência de duas caixas de escrita; links/tarefas avulsas preservados. Commit sugerido: `feat: ativar timeline unica e vinculos de arquivos`.

### 5D — Interface única de Atualizações e Arquivos

**Arquivos:** criar `UI/OrderTimeline.tsx`, `UI/UpdateComposer.tsx`, `UI/OrderFiles.tsx`, `UI/OrderTimeline.test.tsx`, `UI/OrderFiles.test.tsx`; modificar `src/components/OrderDrawer.tsx`, `UI/TaskDetailDrawer.tsx`, `src/app/page.tsx`, `D/attachments.ts`, `D/attachments.test.ts`, `src/types/index.ts` para contextos de Anexo; manter `D/attachment-deletion.ts` salvo correção comprovada por teste.

**Consome:** TimelineEntry, loadTimeline/addUpdate/deleteUpdate e AttachmentContext. **Produz:** `OrderTimeline({entries,onDelete})`, `UpdateComposer({context,onSaved})` com context `{orderId:Id|null;frontId:Id|null;taskId:Id|null}`; `OrderFiles({orderId,frontId,taskId})`; detalhe usa timeline filtrada da mesma fonte.

- [ ] RED: manual/system distinguíveis; origem Frente/Tarefa e autor/hora visíveis; anexos da atualização aparecem também em Arquivos; signed URLs só ao abrir; avulsa não oferece upload; falha de storage após remover metadata mantém aviso e não exclui Pedido.

```ts
render(<OrderTimeline entries={[{id:'a',orderId:'p',frontId:null,taskId:null,kind:'system',
  text:'Pedido finalizado',authorId:null,authorName:'Sistema',at:'2026-09-23T15:00:00Z',followUpDate:null}]}
  onDelete={vi.fn()}/>);
expect(screen.getByText('Sistema')).toBeInTheDocument();
expect(screen.queryByRole('button',{name:'Excluir atualização'})).not.toBeInTheDocument();
```

- [ ] RED: `rtk npm test -- src/components/pedidos-tarefas/OrderTimeline.test.tsx src/components/pedidos-tarefas/OrderFiles.test.tsx src/lib/pedidos-tarefas/attachments.test.ts src/lib/pedidos-tarefas/attachment-deletion.test.ts`.
- [ ] Trocar áreas antigas pela timeline e composer únicos; arquivos ordenados por data, filtro de tipo/Frente/Tarefa simples; reusar upload/compressão existente, máximo 10MB, MIME image/* ou PDF e signed URLs. Upload ligado a atualização só depois de updateId persistido; falha preserva texto e permite reenviar arquivo sem duplicar atualização. Não prometer atomicidade entre Postgres e Storage. Metadados primeiro na remoção, objeto depois; se falhar, exibir advertência atual e interromper exclusão do Pedido.

```ts
if (context.orderId === null) return {ok:false,code:'invalid',message:'Arquivo exige um Pedido'};
// storage_path continua `${organizationId}/${context.orderId}/${fileId}`.
```

- [ ] GREEN, TS/lint. Gate IURQ: revisar histórico importado, registrar contexto, follow-up, upload/falha/exclusão, avulsa e arquivo de Pedido; confirmar não há comentários antigos editáveis. Commit sugerido: `feat: apresentar timeline e arquivos no detalhe do pedido`.

## Lote 6 — Eventos + Calendário (3 gates)

### 6A — Evento independente com associações coerentes

**Arquivos:** criar M15, `D/events.ts`, `D/events.test.ts`, `DBT/pedidos_v1_events.test.sql`, `supabase/verification/pedidos-v1-events.sql`.

**Consome:** organização, membership, customers, Pedido/Frente/tarefa. **Produz:** `pedido_eventos(id,organization_id,tipo,titulo,data date,horario time,responsavel_user_id,observacao,customer_id,pedido_id,frente_id,tarefa_id,created_by,created_at,updated_at)`; `EventKind='meeting'|'visit'|'external_service'|'other'`; `EventV1={id:Id;kind:EventKind;title:string;date:DateKey;time:string;assigneeId:Id;note:string|null;customerId:Id|null;orderId:Id|null;frontId:Id|null;taskId:Id|null}`; `saveEvent(client:SupabaseClient,org:Id,input:EventV1):Promise<WriteResult<EventV1>>`, `deleteEvent(client,org,id:Id):Promise<WriteResult<void>>`.

- [ ] RED: Evento sem Pedido aceito, Frente sem Pedido rejeitada, tarefa do Pedido B com Pedido A rejeitada, cliente explícito conflitante com customer_id do Pedido rejeitado, assignee de outra org rejeitado, membro B não lê evento A. Tarefa avulsa pode ser associada com order/front null, preservando coerência.

```sql
SELECT has_table('public','pedido_eventos');
SELECT ok(NOT has_table_privilege('anon','public.pedido_eventos','SELECT'));
SELECT ok(NOT has_table_privilege('authenticated','public.pedido_eventos','TRUNCATE'));
SELECT col_is_null('public','pedido_eventos','pedido_id');
```

- [ ] RED: `rtk proxy supabase test db supabase/tests/database/pedidos_v1_events.test.sql`; `rtk npm test -- src/lib/pedidos-tarefas/events.test.ts`.
- [ ] M15 aditiva: imediatamente após criar `public.pedido_eventos`, `REVOKE ALL` de PUBLIC, anon e authenticated; conceder somente SELECT/INSERT/UPDATE/DELETE a authenticated, com RLS por organização. Testar privilégios efetivos, inclusive ausência de TRUNCATE/REFERENCES/TRIGGER para authenticated e de todo acesso para anon. FKs compostas para membro/cliente/Pedido/Frente/tarefa; trigger compara associações e deriva Frente/Pedido quando tarefa tem esses vínculos. Nunca inferir customer_id por nome de cliente textual legado; se Pedido tem customer_id real, selecionar outro é conflito. Date/time civil explícitos, sem conversão UTC que troque o dia; sem recorrência/duração/convites. Título/data/horário/responsável obrigatórios; responsável default criador como default seguro, alterável. Índices `(organization_id,data)` e `(organization_id,pedido_id,data)`. FKs RESTRICT para contextos opcionais até desvincular, preservando Evento; excluir Frente requer desvincular Evento.

Cobrir também mutação dos pais: M15 atualiza a rotina de mover Frente da tarefa para manter a Frente dos Eventos vinculados à tarefa coerente, na mesma transação, sob lock do Pedido. Alterar cliente de Pedido com Evento de cliente diferente retorna conflito com contexto para ajustar Evento primeiro, sem reatribuição silenciosa de cliente. Exclusão de Pedido com Eventos exige desvincular esses Eventos antes, sem removê-los. Adicionar esses casos ao pgTAP de 6A; anexos/atividades podem conservar Frente histórica do mesmo Pedido, não precisam ser forçados à Frente atual da tarefa.

```sql
CHECK (tipo IN ('meeting','visit','external_service','other')),
CHECK (frente_id IS NULL OR pedido_id IS NOT NULL)
```

- [ ] GREEN ambos comandos, TS/lint; verificação SQL lista relações inconsistentes e calendário civil inválido (zero). Recovery mantém tabela/RLS e suspende edição; não apagar Eventos. Gate humano/IURQ M15 com quatro tipos e sem Pedido; app anterior continua íntegro. Commit sugerido: `feat: adicionar eventos independentes por organizacao`.

### 6B — Projeção única do calendário

**Arquivos:** criar `D/calendar.ts`, `D/calendar.test.ts`, `D/calendar-queries.ts`, `D/calendar-queries.test.ts`.

**Consome:** TaskV1, Subtask, EventV1, navegação e DateKey. **Produz:** `CalendarScope={orderId?:Id;from:DateKey;to:DateKey}` com limites inclusivos; `CalendarEntry={key:string;kind:'task_due'|'subtask_due'|'follow_up'|EventKind;sourceId:Id;taskId:Id|null;orderId:Id|null;date:DateKey;time:string|null;title:string;completed:boolean;href:string}`; `projectCalendar(input:{tasks:TaskV1[];subtasks:Subtask[];events:EventV1[]},scope:CalendarScope):CalendarEntry[]`; `loadCalendar(client:SupabaseClient,org:Id,scope:CalendarScope):Promise<CalendarEntry[]>`. Para prazo de subtarefa, consulta também pai mesmo se o prazo do pai estiver fora da janela; não perder contexto por filtro inadequado.

- [ ] RED: mesmo taskId com prazo e follow-up gera duas entradas com keys distintas; prazo de subtarefa cujo pai não tem prazo aparece; Evento sem Pedido no global e ausente no filtro de Pedido; inclusão de limites em virada de mês; nenhum dado B; tarefa concluída mantém prazo histórico identificável, mas follow-up concluído sai da fila operacional/calendário de follow-ups ativos.

```ts
const task=taskFixture({id:'t',dueDate:'2026-09-23',followUpDate:'2026-09-23'});
const entries=projectCalendar({tasks:[task],subtasks:[],events:[]},
  {from:'2026-09-01',to:'2026-09-30'});
expect(entries.map(e=>e.key).sort()).toEqual(['follow_up:t','task_due:t']);
expect(entries.every(e=>e.href.includes('tarefa=t'))).toBe(true);
```

- [ ] RED: `rtk npm test -- src/lib/pedidos-tarefas/calendar.test.ts src/lib/pedidos-tarefas/calendar-queries.test.ts`.
- [ ] Consultar as quatro fontes por org e intervalo, filtrar Pedido quando presente; subtarefa faz join pai para org/Pedido; follow-up fonte única tarefas.follow_up_date, nunca snapshot histórico. Projetar em memória somente resultados da janela, dedupe por kind/sourceId; ordenar date/time/key. Prazos concluídos permanecem marcados concluídos para consulta histórica (UI pode ocultá-los localmente, sem fila operacional). Datas de regras pending sem valor não produzem evento falso.

```ts
const key=`task_due:${task.id}`;
const href=buildTaskHref(task.id,task.orderId);
// Subtarefa abre detalhe do pai; Evento usa /calendario?evento=<id>.
```

- [ ] GREEN, TS/lint; mocks verificam org em cada query, nenhum INSERT de calendário nem geração de URLs de anexos. Gate IURQ: comparar janela com registros fonte, incluindo tarefa avulsa e Evento independente. Sem migration. Commit sugerido: `feat: projetar calendario a partir das entidades existentes`.

### 6C — Calendário global e aba do Pedido

**Arquivos:** criar `src/app/calendario/page.tsx`, `UI/CalendarView.tsx`, `UI/EventEditor.tsx`, `UI/CalendarView.test.tsx`, `UI/EventEditor.test.tsx`; modificar `UI/OrderTabs.tsx`, `src/components/OrderDrawer.tsx`, `src/components/app-shell/navigation.ts`, `src/components/app-shell/navigation.test.ts`, `D/navigation.ts`, `D/navigation.test.ts`.

**Consome:** loadCalendar/projectCalendar/saveEvent e navegação. **Produz:** rota `/calendario`, `CalendarView({scope,onOpenEntry})` usando mesmo loader em global e Pedido; `EventEditor({eventId,onClose,onSaved})`; `buildEventHref(eventId:Id):string`. Componente compartilhado recebe cliente/org pelo contexto autenticado existente, não escolhe organização a partir de query string.

- [ ] RED: global lista sete tipos previstos (prazo tarefa/subtarefa/follow-up e quatro Eventos); aba Pedido somente filtra; clique abre entidade real, salva e reflete na outra visão; navegação marca Calendário ativo e mantém AppShell; janela sem entradas tem estado vazio; usuário sem acesso não vê detalhe por URL adivinhada.

```ts
expect(buildEventHref('e1')).toBe('/calendario?evento=e1');
expect(isNavigationActive('calendar','/calendario')).toBe(true);
expect(usesAppShell('/calendario')).toBe(true);
```

- [ ] RED: `rtk npm test -- src/components/pedidos-tarefas/CalendarView.test.tsx src/components/pedidos-tarefas/EventEditor.test.tsx src/components/app-shell/navigation.test.ts src/lib/pedidos-tarefas/navigation.test.ts`.
- [ ] Criar visão compacta de mês com lista acessível por dia, botões mês anterior/próximo e Hoje; sem drag-and-drop. Mesma CalendarView nas duas entradas; habilitar Calendário em OrderTabs. EventEditor oferece quatro tipos, data/horário/responsável e associações opcionais; seleção de tarefa preenche contexto consistente. Clicar prazo/subtarefa/follow-up abre TaskDetailDrawer via URL; Evento abre editor; não editar projeção. Reusar componentes de formulário atuais. Acrescentar Calendário à navegação do Radial sem remover módulo/links existentes.

```tsx
<CalendarView scope={{orderId:order.id,from:monthStart,to:monthEnd}}
  onOpenEntry={entry=>router.push(entry.href)}/>
```

- [ ] GREEN, TS/lint e testes focais de calendário; conferir UI em largura pequena, teclado e rótulos sem depender de cor. Gate IURQ: abrir global e Pedido, criar Evento sem Pedido, editar fonte e comparar ambas visões, navegar para tarefa avulsa, conferir outros módulos.
- [ ] Encerrar Lote 6 em **PRONTO PARA TESTE MANUAL**; somente após aceite e autorização. Commit sugerido: `feat: disponibilizar calendario global e por pedido`.

## 7. Verificação de banco e recuperação por gate

Cada arquivo `supabase/verification/pedidos-v1-*.sql` indicado acima deve conter os checks da sua tarefa e estes blocos adaptados apenas às tabelas existentes naquele ponto. Os SELECTs não substituem pgTAP comportamental.

```sql
-- Integridade de Frente da tarefa (a partir de M01; nulos antigos inventariados até M04).
SELECT t.id FROM public.tarefas t LEFT JOIN public.pedido_frentes f
ON (f.organization_id,f.pedido_id,f.id)=(t.organization_id,t.pedido_id,t.frente_id)
WHERE t.frente_id IS NOT NULL AND f.id IS NULL;

-- Identidade interna (a partir de M02).
SELECT t.id FROM public.tarefas t LEFT JOIN public.organization_members m
ON (m.organization_id,m.user_id)=(t.organization_id,t.waiting_user_id)
WHERE t.waiting_user_id IS NOT NULL AND m.user_id IS NULL;

-- Projeção do status (após M04; fonte canônica muda somente em M06).
SELECT id FROM public.tarefas WHERE concluido IS DISTINCT FROM (status='Concluída');

-- Políticas/grants reais: revisar cada tabela e função adicionada no gate.
SELECT tablename,policyname,cmd,qual,with_check FROM pg_policies
WHERE schemaname='public' AND tablename IN ('pedidos','tarefas','subtarefas',
  'pedido_frentes','tarefa_dependencias','pedido_templates','atividades','anexos','pedido_eventos');
SELECT table_name,grantee,privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND grantee IN ('anon','authenticated')
AND table_name IN ('pedido_frentes','tarefa_dependencias','pedido_templates','atividades','pedido_eventos');
```

Em todos os gates SQL: fixtures RLS como authenticated A, authenticated B e anon; testar SELECT/INSERT/UPDATE/DELETE ou EXECUTE conforme superfície, não só SELECT. Funções SECURITY DEFINER têm `search_path=''`, nomes qualificados, checagem explícita de membership, nenhum grant PUBLIC/anon e nenhum retorno de credenciais. Índices e FKs não substituem RLS. Testar referência a outro Pedido do mesmo tenant além de outro tenant.

**Recuperação operacional:** falha dentro de migration transacional faz rollback da própria transação. Após aplicação bem-sucedida, preferir correção por migration nova e build compatível da fase; nunca editar arquivo aplicado, dropar colunas com dados ou restaurar backup de todo o projeto por conta própria. Antes de backfill/cutover, registrar contagens e proveniência suficientes para auditar a transformação. Restaurar dados exige janela e autorização humana específica, preservando writes posteriores. Não confundir rollback de UI com reversão segura de schema.

**Critérios de parada reais:** divergência do schema vivo versus migrations, migration inesperada pendente, referência histórica impossível de resolver, falha RLS/grants, RED que não falha pela regra esperada, ambiente não identificado como IURQ ou publicação parcial incompatível. Não avançar até corrigir ou obter decisão sobre o dado concreto; não presumir que isso exista hoje.

## 8. Auto-revisão do plano e cobertura da spec

| Requisito da spec | Gates que entregam e validam |
|---|---|
| Baseline de privilégios, CRUD atual e isolamento preservado | 0.5; 1A.1–1A.3 |
| Evolução em camadas, dados atuais e uma fonte canônica | 1A.1–1D; 3A; 5A–5C |
| Identidade canônica, nomes por membership e responsáveis legados sem inferência | inspeção focal antes de 1A.2; 1A.2; 1B.2–1B.3; 3A–3B |
| Pedido manual, vazio e progresso, sem auto conclusão | 1C.1–1D; 2A–2C |
| Frente/Geral e mover antes de remover | 1A.1; 1B.2; 2C; 5C; 6A |
| Status/prioridade/espera/membro/follow-up independentes | 1A.2; 1C; 2C; 3B |
| Subtarefas, dependências e concorrência | 1A.3; 2A/2C; 4C |
| Tarefa rápida na mesma tabela, padrão real | 3A–3B |
| Templates gestão/duplicação/atomicidade/regras civis | 4A–4C |
| Timeline única, notas legadas e avulsas | 5A–5D |
| Arquivos do Pedido e contexto, storage preservado | 2B; 5C–5D |
| Resumo, agrupamentos, detalhe e deep links | 2A–2C; 3B |
| Dashboard e oito dimensões visuais, Central financeira | 2C; 3A–3B; 5C |
| Calendário global e por Pedido, sem cópia | 6A–6C |
| Tenancy/RLS e gates pequenos no IURQ | 0.5; todo gate SQL e protocolo 0.2 |

Auto-revisão documental realizada: as seções da spec estão mapeadas acima; nenhuma tarefa exige feature fora da V1; relacionar avulsa a Pedido, salvar Pedido como template e integrações não são dependências. Adaptações temporárias (bool projetado, status legado no mapper, cópia derivada de comentários) têm fonte de escrita e cutover declarados. Blueprint é definição; tarefas são instâncias independentes. Snapshot histórico de follow-up não participa de cálculo. Calendário é projeção de fontes existentes.

Foram corrigidas na revisão as lacunas de leitura antes da criação de colunas, registro operacional de avulsa antes de atividades aceitar Pedido nulo, remoção de Frente com contextos, edição de Pedido após revogar UPDATE direto e PATCH de subtarefa que poderia sobrescrever regra de data. Nomes/interfaces e responsáveis pelos cinco itens de Review Focus foram conferidos. O Gate 0 foi concluído em leitura no IURQ; esta revisão não repetiu inspeção remota nem executou teste de implementação.

Conferência desta revisão: (1) 1A.1 depende do Gate 0.5, não de nomes; (2) M01 neutraliza os grants herdados de PUBLIC, anon e authenticated antes de conceder CRUD; (3) M03, M09, M15 e qualquer tabela nova da V1 seguem a mesma regra, com teste de privilégios efetivos; (4) M00 retira apenas TRUNCATE de authenticated e verifica o CRUD direto, RLS e isolamento já necessários; (5) M04 conserva os quatro responsáveis textuais com IDs nulos, sem inferência; (6) a inspeção focal de 1A.2 determina a única fonte canônica de nome e 1B.3 exige associação nominal verificada antes das funcionalidades dependentes; (7) somente IURQ é destino previsto, MISFY permanece fora do fluxo; (8) nenhum item fora da V1 tornou-se dependência. A sequência é Gate 0 já concluído → Gate 0.5 → Lote 1 (nove gates) → Lotes 2–6, com 25 gates futuros e 16 migrations planejadas.

Os gates de UI não dependem de migrations de lotes posteriores: notas/arquivos legados seguem usáveis até 5C, calendário só aparece funcional em 6C, templates D+n funcionam antes das regras de conclusão. Em cada gate somente os testes focais descritos e TS/lint aplicáveis são requeridos; ampliar suíte apenas se surgir risco concreto ou gate obrigatório do projeto.

## 9. Entrega e abordagem recomendada

Abordagem aprovada: **Native**, com o mesmo agente implementando sequencialmente, pois contratos, transições de banco e gates dependem diretamente uns dos outros e o projeto usa um agente principal por padrão. Usar `superpowers:executing-plans` após a revisão deste plano e respeitar cada gate. Revisão independente ao fim pode ser combinada com o usuário; não disparar agentes automaticamente.

Este documento não é um prompt de despacho para outro harness/modelo. Se houver transferência de execução, preparar o Operator Contract e handoff exigidos em AGENTS com os valores reais do destino, sem inventar modelo/thinking ou criar outro worktree para a mesma feature.

**Ponto de parada atual:** revisar somente este plano. Não criar arquivos SQL, componentes, testes ou alterar Supabase. Não fazer commit do plano sem autorização explícita.
