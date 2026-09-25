---
name: radial-handoff
description: Transferência de trabalho entre modelos/agentes (Codex, GLM, Claude) no mesmo worktree do Sistema_Pedidos_Radial, sem reconstruir nem reauditar o que já está verde.
---

# radial-handoff

Checkpoint curto gravado em `docs/superpowers/handoffs/`, contendo: worktree; branch; HEAD/base; estado Git; tarefa/feature; concluído; pendente; testes verdes; falhas conhecidas; decisões já tomadas; próximo passo exato. `docs/AI_CHECKPOINT.md` permanece o ponteiro do estado corrente.

## Regras

- Agente de origem termina o bloco atual em estado consistente antes de gravar o checkpoint.
- Agente seguinte lê o checkpoint + `git status`/diff e continua do próximo passo exato.
- Não reauditar trabalho já verde.
- Não criar novo worktree para a mesma feature.
- Preservar alterações não commitadas.
- Nunca dois agentes editando simultaneamente o mesmo worktree.

Ao trocar de harness/modelo, o checkpoint PODE registrar adicionalmente (informativos): harness/modelo de origem; harness/modelo de destino, se já definido. A seleção concreta de modelo é definida no prompt operacional (ver AGENTS.md), não nesta skill.
