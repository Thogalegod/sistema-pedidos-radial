<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Sistema_Pedidos_Radial — regras permanentes

- Base estável de desenvolvimento: `codex/controle-locacoes`, salvo indicação explícita em `docs/AI_CHECKPOINT.md`.
- IURQ `iurqgskfuupslrghgtej` = desenvolvimento/homologação. MISFY `misfyiznwnuvldoccciw` = produção protegida: nunca acessar/modificar sem autorização humana explícita e separada para aquela ação.
- Nunca ler/expor secrets, API keys ou passwords.
- Git seguro: nunca `git add .`/`git add -A`; nunca stash/reset/clean/force push por padrão; preservar untracked deliberados (`git status` sujo é normal neste repo).
- Servidor Next: iniciado/reiniciado manualmente pelo usuário no Windows; não perca tempo tentando mantê-lo no sandbox.
- RTK preferido nos comandos suportados; não repetir um comando raw só para obter saída mais longa.
- Não reabrir trabalho já aprovado sem regressão concreta.
- Testes proporcionais ao risco; suíte completa só em checkpoint significativo.
- Worktrees: 1 feature ativa = 1 worktree; NÃO 1 agente = 1 worktree; a mesma feature pode passar entre Codex/GLM/Claude no mesmo worktree; worktree temporário de feature independente é removido após a integração.
- Handoff entre modelos: checkpoint curto via skill `radial-handoff`; ao retomar trabalho, ler `docs/AI_CHECKPOINT.md` e preferir estado do repositório (specs/plans/checkpoints) a histórico de chat.
- Gate humano: o usuário é o gate do teste manual final (`PRONTO PARA TESTE MANUAL` → teste do usuário → `aprovado` → só então staging seletivo + `npm run ai:gate:staged` + commit/push).

## Prompt / Operator Contract

Toda instrução operacional destinada a um agente/harness deve declarar explicitamente, quando aplicável:

- CHAT: NOVO ou MESMO
- HARNESS: Codex / Kimi Code / MiMo Code / Claude Code / outro
- MODELO: modelo exato
- THINKING: nível exato disponível naquele harness
- MOTIVO: por que esse modelo/nível foi escolhido
- WORKTREE: caminho exato
- BRANCH: branch exata
- SKILLS: skills que devem ser usadas
- RTK: OBRIGATÓRIO / PREFERENCIAL / NÃO APLICÁVEL
- YOLO: ON / OFF / NÃO APLICÁVEL

Objetivo: o usuário não deve precisar lembrar dessas decisões técnicas. AGENTS.md é a fonte permanente desta regra; não copiar este cabeçalho para as skills.

## Model / Harness Selection

- Usar o modelo mais econômico capaz de executar a tarefa com segurança e qualidade suficiente.
- Não trocar de modelo durante uma feature sem motivo concreto (limite/cota, custo, qualidade insuficiente, aumento relevante de risco/complexidade).
- Troca de modelo somente em estado consistente, via skill `radial-handoff`; nunca dois modelos editando simultaneamente o mesmo worktree.
- Alto contexto + baixo risco favorece modelo econômico; banco, segurança, concorrência, RLS/RPC/grants, produção ou decisões arquiteturais delicadas favorecem modelo de maior confiança.
- Nenhuma função fixa: MiMo não é obrigatoriamente explorer; GLM não é obrigatoriamente implementer; Codex não é obrigatoriamente reviewer. Uma tarefa pode ser concluída inteiramente por um único modelo se estiver funcionando bem.
- A seleção concreta é feita externamente, no prompt operacional (Operator Contract); não há tabela rígida nem roteador automático no repositório.

## Skills (fonte canônica única)

- `.agents/skills/radial-fast-development/SKILL.md` — fluxo normal de desenvolvimento até `PRONTO PARA TESTE MANUAL`.
- `.agents/skills/radial-safety/SKILL.md` — tarefas de risco: Supabase, migrations, RLS/RPC/grants, secrets, deploy, mudança de ambiente, Git delicado.
- `.agents/skills/radial-handoff/SKILL.md` — transferência de trabalho entre modelos/agentes sem reconstruir.
