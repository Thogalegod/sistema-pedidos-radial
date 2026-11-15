# Radial Agent & Skills Workflow

**Data:** 2026-08-27
**Estado:** spec final para aprovação (rev. 2) — nada implementado
**Substitui como direção:** `docs/superpowers/specs/2026-08-25-ai-agent-development-workflow-design.md`

## Objetivo

Reduzir prompts gigantes, consumo de tokens e idas e vindas entre usuário e agentes, com o mínimo de infraestrutura permanente:

- `AGENTS.md` curto com regras permanentes do projeto;
- 3 skills pequenas e reutilizáveis: `radial-fast-development`, `radial-safety`, `radial-handoff`;
- preferência por RTK nos comandos suportados;
- agentes/subagentes somente quando houver ganho concreto.

Não é um framework multiagente. É um contrato mínimo que Codex, GLM e Claude conseguem usar lendo apenas o repositório.

## Princípios

1. Estado vive no repositório (Git + docs + checkpoint), não no histórico de chat.
2. O usuário é gate de decisão material nova, do teste manual final e de produção.
3. Menos agentes por padrão: 1 agente principal resolve a maioria das tarefas.
4. Testes proporcionais ao risco; suíte completa só em checkpoint significativo.
5. KISS/YAGNI: nada de dispatcher, orchestrator, daemon, banco de estado de agentes ou hooks complexos.
6. Fail-closed para produção (MISFY) e para segredos.
7. Skills seguem o padrão nativo do Codex/Open Agent Skills: fonte canônica única em `.agents/skills/` (`radial-fast-development`, `radial-safety`, `radial-handoff`), cada `SKILL.md` com frontmatter mínimo (`name`, `description`) seguido pelas instruções. Codex descobre e invoca nativamente; GLM e Claude seguem os mesmos arquivos lendo-os no repositório. Sem cópia em `docs`, sem plugin, sem MCP, sem wrapper, sem symlink desnecessário e sem cópias específicas por harness.

## Política de raciocínio

Usar sempre o menor nível de raciocínio suficiente para a tarefa; nenhum nível é universal.

- **Kimi/GLM:** Low para tarefas rotineiras/bounded; High para arquitetura, segurança, banco ou complexidade relevante; Max somente excepcionalmente.
- **Codex:** Medium, quando disponível, para tarefas normais; High quando risco/complexidade justificar.
- **Outros harnesses:** aplicar o equivalente disponível.

Nenhuma skill depende de um nome de nível que não exista em todos os harnesses: as skills referenciam esta política, não um nível fixo. Tarefas típicas de `radial-safety` (segurança, banco, deploy) correspondem a High ou equivalente.

## Prompt / Operator Contract

O AGENTS.md define um contrato operacional curto: toda instrução destinada a um agente/harness declara explicitamente, quando aplicável, CHAT (NOVO/MESMO), HARNESS, MODELO, THINKING, MOTIVO, WORKTREE, BRANCH, SKILLS, RTK e YOLO. Objetivo: o usuário não precisa lembrar dessas decisões técnicas; o contrato vive permanentemente em AGENTS.md (não é copiado para as skills).

## Model / Harness Selection

Política simples registrada em AGENTS.md: usar o modelo mais econômico capaz de executar a tarefa com segurança e qualidade suficiente; não trocar de modelo durante uma feature sem motivo concreto (limite/cota, custo, qualidade insuficiente, aumento relevante de risco/complexidade); troca somente em estado consistente via `radial-handoff`, nunca dois modelos simultâneos no mesmo worktree; alto contexto + baixo risco favorece modelo econômico, risco alto (banco, segurança, concorrência, RLS/RPC/grants, produção, arquitetura delicada) favorece modelo de maior confiança; nenhuma função fixa por modelo. A seleção concreta é feita externamente no prompt operacional — não há tabela rígida nem roteador automático no repositório.

## AGENTS.md

Arquivo raiz, mapa e regras permanentes. Mantém o bloco existente de avisos do Next.js. Somente regras que sempre valem; sem histórico de features; aponta para as skills em `.agents/skills/` quando necessário, sem copiar seu conteúdo; alvo: curto.

Conteúdo:

- **Ambientes:** IURQ `iurqgskfuupslrghgtej` = desenvolvimento/homologação; MISFY `misfyiznwnuvldoccciw` = produção protegida; MISFY nunca é acessado/modificado sem autorização humana explícita e separada para aquela ação.
- **Secrets:** nunca ler/expor secrets, API keys ou passwords.
- **Git seguro:** nunca `git add .`; nunca stash/reset/clean/force push por padrão; preservar estado Git deliberado (untracked legítimos ficam como estão).
- **Servidor Next:** iniciado/reiniciado manualmente pelo usuário no Windows; agentes não perdem tempo tentando manter o Next no sandbox.
- **RTK:** preferido nos comandos suportados; não repetir um comando raw só para obter saída mais longa.
- **Trabalho aprovado:** não reabrir sem regressão concreta.
- **Testes:** proporcionais ao risco; evitar suíte completa por padrão.
- **Worktrees:** 1 feature ativa = 1 worktree; NÃO 1 agente = 1 worktree; a mesma feature pode passar entre Codex/GLM/Claude no mesmo worktree; features independentes podem usar worktrees temporários separados, removidos depois da integração.
- **Handoff:** entre modelos via checkpoint curto (skill `radial-handoff`).
- **Gate humano:** o usuário é o gate do teste manual final (`PRONTO PARA TESTE MANUAL` → teste do usuário → `aprovado` → só então commit/push seletivo).

## Skill radial-fast-development

Arquivo: `.agents/skills/radial-fast-development/SKILL.md`.

Fluxo normal de desenvolvimento.

Fluxo: entender escopo → implementar autonomamente → testes focados → TypeScript (`tsc --noEmit`) → diff check → reportar `PRONTO PARA TESTE MANUAL`.

Regras:

- 1 agente principal; sem subagentes, review independente ou múltiplas auto-revisões por padrão.
- Sem suíte completa e sem Playwright completo por padrão.
- Não interromper o usuário por decisões técnicas internas já cobertas pelo escopo.
- Interromper apenas para decisão material nova: UX, negócio, dados, permissão, escopo ou ação destrutiva.
- TDD focado para comportamento novo/bug.
- Nível de raciocínio: o menor suficiente, conforme a Política de raciocínio (rotineira/bounded = Low ou equivalente; complexidade relevante = High ou equivalente).
- Termina sempre em `PRONTO PARA TESTE MANUAL`.
- Sem commit/push antes do teste manual, salvo autorização explícita.

## Skill radial-safety

Arquivo: `.agents/skills/radial-safety/SKILL.md`.

Tarefas de maior risco. Gatilhos: Supabase, migrations, RLS, RPC, grants, secrets, deploy, mudança de ambiente, operações Git delicadas.

Princípios:

- Confirmar a identidade do ambiente antes de qualquer ação remota.
- IURQ permitido conforme o escopo aprovado.
- MISFY fail-closed: qualquer dúvida = não fazer.
- Dry-run antes de migration quando aplicável.
- Migration inesperada no caminho = parar e reportar.
- Não expor secrets.
- Staging seletivo (caminhos explícitos).
- Sem comandos destrutivos por padrão.
- Aplicar somente o escopo explicitamente aprovado.
- Validação focal pós-operação.

## Skill radial-handoff

Arquivo: `.agents/skills/radial-handoff/SKILL.md`.

Transferência entre modelos/agentes (Codex ↔ GLM ↔ Claude) sem reconstruir trabalho.

Checkpoint curto contendo: worktree; branch; HEAD/base; estado Git; tarefa/feature; concluído; pendente; testes verdes; falhas conhecidas; decisões já tomadas; próximo passo exato.

Regras:

- Agente de origem termina o bloco atual em estado consistente antes de gravar o checkpoint.
- Agente seguinte lê checkpoint + `git status`/diff e continua.
- Não reauditar trabalho já verde.
- Não criar novo worktree para a mesma feature.
- Preservar alterações não commitadas.
- Nunca dois agentes editando simultaneamente o mesmo worktree.

Local padrão do checkpoint: `docs/superpowers/handoffs/` (formato já existente no repo); `docs/AI_CHECKPOINT.md` segue como ponteiro do estado corrente.

## Política de agentes/worktrees

Agentes/subagentes ficam DESLIGADOS por padrão.

| Situação | Uso |
| --- | --- |
| Tarefa normal | 1 agente principal |
| Tarefa grande mas sequencial | 1 agente principal |
| Duas features realmente independentes | até 2 agentes em paralelo, worktrees separados |
| Investigação/teste isolado | subagente somente com ganho claro |

Não criar por padrão: frontend agent, backend agent, reviewer, tester, security agent, orchestrator, dispatcher, múltiplos níveis de agentes.

## RTK

- RTK já está instalado no computador do usuário e configurado globalmente para Codex; a infra do projeto apenas documenta a preferência, não recria.
- Não criar wrapper, hook complexo ou duplicação do RTK.
- Harness não integrado ao RTK: seguir com a ferramenta nativa daquele harness sem bloquear a tarefa para configurar integração.
- Usar raw somente quando RTK não suportar o comando ou quando a saída completa for necessária.

## Fluxos exemplares

### 1. Feature normal

Prompt: "Use radial-fast-development. Implemente X conforme estes requisitos. Pare em PRONTO PARA TESTE MANUAL."

Agente lê `AGENTS.md` + skill → pergunta somente se houver decisão material não coberta pelo escopo → implementa → testes focados + `tsc --noEmit` → diff check → reporta `PRONTO PARA TESTE MANUAL`. Sem commit. Após o usuário testar e dizer `aprovado` → staging seletivo + commit/push.

### 2. Migration Supabase

Prompt: "Use radial-fast-development e radial-safety. Implemente a migration Y."

Agente confirma que o project ref é IURQ → dry-run/review da migration → aplica somente o escopo aprovado → validação focal pós-aplicação → `PRONTO PARA TESTE MANUAL`. MISFY permanece intocado em qualquer cenário.

### 3. Handoff Codex → GLM

Codex termina o bloco atual em estado consistente → grava checkpoint no formato `radial-handoff` com o próximo passo exato → para.

GLM lê checkpoint + `git status`/diff → continua do próximo passo no mesmo worktree → não reaudita o que já está verde.

## Relação com a infraestrutura existente

O repo já contém a infraestrutura da iteração anterior (`.claude/agents/` com 6 subagentes, `.claude/rules/`, hook `PreToolUse` + `scripts/ai/`). Posições da spec:

- Os 6 subagentes antigos NÃO serão mantidos como arquitetura padrão; serão absorvidos pelas skills/AGENTS.md ou removidos.
- Regras duplicadas da infraestrutura antiga serão removidas/absorvidas. NÃO queremos dois sistemas concorrentes.
- O hook `PreToolUse` antigo NÃO é presumido necessário: sua permanência será decidida explicitamente no plano, após inspecionar exatamente o que ele faz.
- Utilitários deterministas simples de segurança já existentes só poderão permanecer se: (1) forem realmente úteis; (2) não duplicarem `AGENTS.md`/`radial-safety`; (3) não criarem custo recorrente relevante; (4) não prenderem o projeto ao Claude; (5) não criarem hooks complexos ou comportamento surpreendente.

## Fora de escopo

Multi-harness; dispatcher; orchestrator; banco de estado de agentes; novos servidores; daemon; hooks complexos; monitoramento de agentes; worktree por agente; framework de agentes; CI adicional só para esta infraestrutura; testes artificiais da infraestrutura; dependências npm; dependências Python; plugins; MCP; wrappers; symlinks desnecessários; cópias específicas por harness; duplicar as skills fora de `.agents/skills/`; reconstruir ferramentas do Codex, do Kimi ou do Claude.

## Critérios de sucesso

1. Um prompt futuro pode ser aproximadamente: "Use radial-fast-development e radial-safety. Implemente X conforme estes requisitos. Pare em PRONTO PARA TESTE MANUAL." — sem repetir centenas de linhas de regras.
2. Codex, GLM ou Claude entendem a infraestrutura rapidamente lendo apenas o repositório, sem infraestrutura paralela.
3. As 3 skills vivem canonicamente em `.agents/skills/` (padrão Codex/Open Agent Skills): Codex as descobre nativamente, GLM/Claude as seguem lendo o repositório; nenhuma ferramenta existente (RTK, Codex, Kimi, Claude) é duplicada ou reconstruída.
4. Estado Git deliberado permanece preservado; MISFY e segredos permanecem intocados.
5. Menos tokens e menos idas e vindas por feature.
