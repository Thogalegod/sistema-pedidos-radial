# Plano: Infraestrutura Radial Agent & Skills — Implementação

**Data:** 2026-08-27
**Estado:** plano para revisão — NÃO executar nesta rodada
**Spec canônica:** `docs/superpowers/specs/2026-08-27-radial-agent-skills-workflow-design.md` (APROVADA)
**Base:** worktree `C:\tmp\Sistema_Pedidos_Radial-unificar-transformador`, branch `codex/controle-locacoes`, HEAD `188c40ac06d9282f71db5d0fb2fd7e52773cacf2`

## Restrições globais

- Preservar integralmente os untracked deliberados (`.next-bloqueada-20260804/`, plans de 2026-08-18/19, `pw-report-*`, `pw-results-*`) e a spec/plano novos ainda não commitados.
- Nunca `git add .`/`git add -A`, nunca stash/reset/clean; staging somente de caminhos explícitos listados neste plano e SOMENTE na Task 5, após aprovação humana — nada é staged antes (nem com `git rm`).
- Não tocar `src/`, `e2e/`, `supabase/`, IURQ, MISFY, servidor Next, nem rodar testes do App.
- Commit/push somente na Task 5, após validação humana explícita.
- RTK preferido nos comandos suportados; usar raw git onde a saída completa for necessária.

## Decisões de legado (inspecionado em 2026-08-27)

| Componente | Decisão | Motivo |
| --- | --- | --- |
| `AGENTS.md` atual (19 linhas) | KEEP | Arquivo permanece; só é revisto na Task 2 para a versão curta da spec (sem conflito estrutural). |
| `CLAUDE.md` (orchestrator contract) | SIMPLIFY | Reduzir a ponteiro para `AGENTS.md` + `.agents/skills/`; o conteúdo de orquestração multiagente é a arquitetura concorrente que a spec desliga. |
| `.claude/agents/` (6 subagentes) | REMOVE | Sistema concorrente de múltiplos agentes; o conteúdo útil (safety/testing/git) já converge para AGENTS.md + skills. |
| `.claude/rules/` (3 arquivos path-scoped) | ABSORB | Regras migram: supabase-safety → `radial-safety`; testing → `radial-fast-development`; git-workflow → `AGENTS.md`; arquivos Claude-specific somem. |
| `.claude/settings.json` (hook `PreToolUse` + denies) | REMOVE | Hook inspecionado: bloqueia MISFY-ref, git destrutivo e escrita em `.env`/`.pem` — proteções idênticas às regras de AGENTS.md/radial-safety; roda em toda tool call, só existe no Claude e duplica a regra em vez de verificá-la. |
| `scripts/ai/guard-tool-call.mjs` + test | REMOVE | Só tem função como payload do hook `PreToolUse`; sem o hook é código morto. |
| `scripts/ai/preflight.mjs` | REMOVE | Envolve comandos git de leitura que `radial-handoff` já prescreve explicitamente (`git status`/`rev-parse`/`fetch`); valor marginal, sem proteção única. |
| `scripts/ai/staged-gate.mjs` + test | KEEP | Verificação determinística EXPLÍCITA (não-hook) do staging: bloqueia `.env`/secrets/`pw-*`/`.next*` no commit, roda `git diff --cached --check`, escaneia marcadores de segredo; Node puro, neutro de harness, custo só quando invocado. Atende aos 5 critérios. |
| `package.json` scripts `ai:*` | SIMPLIFY | Manter `ai:gate:staged` e `ai:gate:test`; remover `ai:preflight`, `ai:guard:test`, `ai:agents:validate` (referem-se a componentes removidos). |
| `docs/AI_CHECKPOINT.md` | KEEP | Ponteiro de estado corrente usado por AGENTS.md/radial-handoff; conteúdo atualizado na Task 4 (aponta para spec/plano atuais, Lote B encerrado). |
| `docs/superpowers/handoffs/` | KEEP | Local canônico dos checkpoints de `radial-handoff` (spec); arquivo existente é histórico válido. |
| specs/plans 2026-08-25 (workflow antigo) | KEEP | Registro histórico; deixam de ser referência ativa (AI_CHECKPOINT passa a apontar para a spec 2026-08-27). |
| `.gitignore` (entradas Claude locais) | KEEP | Entradas `settings.local.json`/`CLAUDE.local.md` seguem úteis e inofensivas; sem mudança. |

## Estrutura final

- **Criar:** `.agents/skills/radial-fast-development/SKILL.md`, `.agents/skills/radial-safety/SKILL.md`, `.agents/skills/radial-handoff/SKILL.md`
- **Modificar:** `AGENTS.md`, `CLAUDE.md`, `package.json`, `docs/AI_CHECKPOINT.md`
- **Remover:** `.claude/agents/` (6 arquivos), `.claude/rules/` (3 arquivos), `.claude/settings.json`, `scripts/ai/guard-tool-call.mjs`, `scripts/ai/guard-tool-call.test.mjs`, `scripts/ai/preflight.mjs`
- **Preservar:** `scripts/ai/staged-gate.mjs`, `scripts/ai/staged-gate.test.mjs`, `docs/superpowers/handoffs/`, specs/plans históricos, `.gitignore`, todos os untracked deliberados

## Task 1 — Desmontar legado conflitante

1. Remover fisicamente os 13 arquivos antigos (remoção normal de arquivo; NÃO usar `git rm`, que deixaria as deleções staged): `.claude/agents/radial-explorer.md`, `.claude/agents/radial-implementer.md`, `.claude/agents/radial-tester.md`, `.claude/agents/radial-reviewer.md`, `.claude/agents/radial-database.md`, `.claude/agents/radial-security.md`, `.claude/rules/supabase-safety.md`, `.claude/rules/testing.md`, `.claude/rules/git-workflow.md`, `.claude/settings.json`, `scripts/ai/guard-tool-call.mjs`, `scripts/ai/guard-tool-call.test.mjs`, `scripts/ai/preflight.mjs` (`.claude/` fica sem arquivos rastreados). As deleções ficam UNSTAGED; staging só na Task 5.
2. `package.json`: remover os scripts `ai:preflight`, `ai:guard:test`, `ai:agents:validate`; manter `ai:gate:staged` e `ai:gate:test`; não tocar os demais scripts.
3. `CLAUDE.md` → ponteiro mínimo: manter `@AGENTS.md` na primeira linha + 1–2 linhas apontando para `.agents/skills/` (sem orquestração, sem regras duplicadas).
4. Verificar: `git status --short` mostra as 13 deleções como unstaged (` D`), os untracked deliberados intactos e nada staged.

## Task 2 — Atualizar AGENTS.md

1. Manter o bloco `nextjs-agent-rules` existente.
2. Reescrever a seção de regras permanentes conforme a seção "AGENTS.md" da spec (curto, ~25–30 linhas): ambientes IURQ/MISFY (autorização separada por ação), secrets, git seguro (sem `git add .`, sem stash/reset/clean/force push por padrão, preservar untracked deliberados), servidor Next do usuário no Windows, RTK preferido + não repetir raw por saída mais longa, não reabrir trabalho aprovado sem regressão, testes proporcionais ao risco, worktrees (1 feature = 1 worktree; NÃO 1 agente = 1 worktree), handoff via `radial-handoff` + `docs/AI_CHECKPOINT.md`, gate humano (`PRONTO PARA TESTE MANUAL` → `aprovado` → commit/push seletivo).
3. Apontar para `.agents/skills/` SEM copiar o conteúdo das skills.
4. Verificar: arquivo curto; nenhuma regra duplica integralmente uma skill; referências apontam para os 3 SKILL.md e para `docs/AI_CHECKPOINT.md`.

## Task 2b — Prompt Contract e política de modelos (adicionado em revisão)

1. AGENTS.md ganha duas seções curtas: **Prompt / Operator Contract** (cabeçalho operacional que o usuário inclui nos prompts: CHAT, HARNESS, MODELO, THINKING, MOTIVO, WORKTREE, BRANCH, SKILLS, RTK, YOLO) e **Model / Harness Selection** (modelo mais econômico suficiente; troca só com motivo concreto, em estado consistente via `radial-handoff`; sem função fixa por modelo; seleção concreta fica no prompt operacional — sem roteador/tabela rígida).
2. `radial-handoff`: ajuste mínimo — o checkpoint PODE registrar harness/modelo de origem e destino (informativos).
3. Sem script, dispatcher, orchestrator, agente seletor, config automática, banco de estado, wrapper, plugin, MCP ou dependência nova; somente documentação.

## Task 3 — Criar as 3 Skills

Cada `SKILL.md` curto (~25–35 linhas), frontmatter mínimo `name` + `description` seguido das instruções, conteúdo conforme as seções da spec:

1. `radial-fast-development`: fluxo normal (escopo → implementação autônoma → testes focados → `tsc --noEmit` → diff check → `PRONTO PARA TESTE MANUAL`), TDD focal, sem subagentes/review independente/suíte completa por padrão, interromper só por decisão material nova (UX, negócio, dados, permissão, escopo, destrutiva), menor raciocínio suficiente (sem nome de nível fixo), sem commit/push antes da aprovação manual, 1 agente principal.
2. `radial-safety`: gatilhos (Supabase, migrations, RLS, RPC, grants, secrets, deploy, mudança de ambiente, Git delicado); identidade do ambiente antes de qualquer ação remota; IURQ permitido conforme escopo; MISFY fail-closed; dry-run quando aplicável; migration inesperada = parar; staging seletivo (`npm run ai:gate:staged` antes de commit); escopo aprovado somente; validação focal pós-operação.
3. `radial-handoff`: checkpoint curto (worktree, branch, HEAD/base, estado Git, tarefa, concluído, pendente, testes verdes, falhas conhecidas, decisões, próximo passo exato) em `docs/superpowers/handoffs/`; origem termina bloco consistente; seguinte lê checkpoint + status/diff; não reaudita verde; não cria worktree novo para a mesma feature; preserva não commitados; nunca dois agentes no mesmo worktree.
4. Verificar: os 3 arquivos existem, frontmatter válido (`name`/`description`), nenhum conteúdo copiado de AGENTS.md.

## Task 4 — Checkpoint, referências restantes e validação

1. Atualizar `docs/AI_CHECKPOINT.md`: base estável e HEAD, Lote B encerrado (`188c40a`), referências à spec/plano 2026-08-27 (substituindo as de 2026-08-25), ambientes, regra de resume. Compacto.
2. Greps de limpeza (referências ATIVAS fora do histórico documental devem dar 0):
   - `rg -n "radial-(explorer|implementer|tester|reviewer|database|security)" --glob '!docs/superpowers/**'`
   - `rg -n "PreToolUse|guard-tool-call|ai:preflight|ai:agents:validate|ai:guard:test" --glob '!docs/superpowers/**'`
   - Exceção justificada: `docs/superpowers/**` (spec/plano novos citam o legado como contexto; docs 2026-08-25 são histórico).
3. Estrutura: `.agents/skills/*/SKILL.md` existem; `git ls-files .claude` vazio.
4. Consistência AGENTS.md ↔ Skills: leitura rápida confirmando que não há contradição nem dois sistemas concorrentes.
5. `git diff --check` limpo (cobre também as deleções unstaged). NÃO exigir `git diff --cached --check` nesta fase: nada está staged antes da aprovação humana; o `--cached` roda somente na Task 5, após o staging seletivo.
6. Opcional (package.json foi editado): `npm run ai:gate:test` deve passar.
7. Reportar `PRONTO PARA TESTE MANUAL` com o roteiro: em CHAT NOVO (qualquer harness), (a) agente identifica AGENTS.md ao iniciar; (b) consegue usar `radial-fast-development` numa feature fictícia pequena; (c) ao ser questionado sobre migration/Supabase, invoca/respeita `radial-safety` (IURQ permitido, MISFY fail-closed).

## Task 5 — Commit separado da infraestrutura (SOMENTE após validação humana futura)

1. Aguardar aprovação humana explícita após o teste manual; não inferir de aprovações anteriores.
2. Staging seletivo de tudo da infraestrutura — novos, modificados e removidos — com `git add` em caminhos explícitos: `AGENTS.md`, `CLAUDE.md`, `package.json`, `docs/AI_CHECKPOINT.md`, `docs/superpowers/specs/2026-08-27-radial-agent-skills-workflow-design.md`, `docs/superpowers/plans/2026-08-27-radial-agent-skills-workflow-implementation.md`, `.agents/skills/radial-fast-development/SKILL.md`, `.agents/skills/radial-safety/SKILL.md`, `.agents/skills/radial-handoff/SKILL.md` e as 13 deleções da Task 1 (para arquivo já removido, `git add <caminho>` registra a deleção; não usar `git rm`). Nunca `git add .`.
3. Confirmar que nenhum untracked deliberado entrou no staged: revisar `git diff --cached --name-status` e `git status --short`.
4. Executar `npm run ai:gate:staged`; deve terminar em `STAGED_GATE_PASS`.
5. Executar `git diff --cached --check`; deve estar limpo.
6. Revisar o resumo do staged (arquivos novos/modificados/deleções) antes de seguir.
7. Commit sugerido: `chore: substituir infra de agentes por AGENTS.md curto e skills radiais`.
8. Push normal da branch `codex/controle-locacoes` após o commit, com aprovação do usuário. Sem merge/rebase; MISFY e IURQ intocados.

## Riscos (máx. 5)

1. **Perda do bloqueio automático do hook** (MISFY/git destrutivo deixam de ser bloqueados deterministicamente por tool call) — mitigação: regras em destaque em AGENTS.md + radial-safety; `staged-gate` continua verificando o commit; se houver incidente, a proteção volta como script explícito simples.
2. **Claude perde as deny rules de leitura de `.env`** — mitigado pela regra de secrets em AGENTS.md/radial-safety; custo aceito para não manter infra por harness.
3. **Descoberta nativa das skills depende de o Codex suportar `.agents/skills`** — arquivos são markdown comuns; qualquer harness consegue segui-los lendo o repositório.
4. **Perda do contexto path-scoped das `.claude/rules`** — conteúdo absorvido nas skills; Claude passa a ser orientado via AGENTS.md + skills.
5. **Remoção de componentes commitados com untracked deliberados no meio** — plano usa remoção física de caminhos explícitos, staging somente na Task 5 e verificação de status na Task 1; nada de `clean`/`add .`/`git rm`.
