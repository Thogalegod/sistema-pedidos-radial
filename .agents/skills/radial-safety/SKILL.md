---
name: radial-safety
description: Proteções para tarefas de maior risco no Sistema_Pedidos_Radial — Supabase, migrations, RLS, RPC, grants, secrets, deploy, mudança de ambiente e operações Git delicadas. Usar junto com radial-fast-development quando houver esses gatilhos.
---

# radial-safety

## Gatilhos

Supabase, migrations, RLS, RPC, grants, secrets, deploy, mudança de ambiente, operações Git delicadas.

## Princípios

- Confirmar a identidade do ambiente antes de qualquer ação remota.
- IURQ `iurqgskfuupslrghgtej` = desenvolvimento/homologação, permitido conforme o escopo aprovado.
- MISFY `misfyiznwnuvldoccciw` = produção protegida, fail-closed: qualquer dúvida = não fazer.
- Dry-run antes de migration quando aplicável; migration inesperada no caminho = parar e reportar.
- Não expor secrets.
- Staging seletivo (caminhos explícitos); rodar `npm run ai:gate:staged` antes de commit.
- Sem comandos destrutivos por padrão.
- Aplicar somente o escopo explicitamente aprovado.
- Validação focal pós-operação.
