# Estado atual do projeto

Última atualização manual deste arquivo: 2026-08-17

## Objetivo deste arquivo

Dar contexto rápido para qualquer agente continuar o projeto sem depender do histórico inteiro do chat.

## Ambientes Supabase atuais

- **IURQ** `iurqgskfuupslrghgtej`: desenvolvimento/homologação e projeto Supabase linkado para os trabalhos atuais.
- **MISFY** `misfyiznwnuvldoccciw`: futura produção protegida. Não aplicar migrations, QA funcional ou alterações sem etapa explícita de preparação de produção.
- O ambiente local de desenvolvimento deve apontar para o IURQ, nunca para o MISFY por padrão.

## Módulos já trabalhados e consolidados nesta linha de desenvolvimento

Os seguintes módulos já receberam implementação, correções e validações ao longo das branches acumuladas que antecedem o PR atual:

- Contratos e Locações;
- Pedidos e Tarefas;
- Relatórios de Cabine;
- Termografia;
- Inspeções / Relatórios de Transformador;
- Manutenção Preventiva da Cabine Primária.

Esses módulos não devem ser reabertos sem regressão concreta ou nova necessidade funcional.

## Controle de Locações — estado atual

A branch atual de desenvolvimento é:

`codex/controle-locacoes`

O trabalho consolidado inclui financeiro de locações, ativos físicos, devolução/encerramento e proteção concorrente contra dupla reserva do mesmo ativo.

### Lote 3A — ativos físicos e disponibilidade

Concluído e aprovado no IURQ.

Principais migrations:

- `202608121300_add_rental_assets.sql`
- `202608131100_restrict_rental_assets_grants.sql`

### Lote 3B — devolução e encerramento

Concluído e aprovado no IURQ.

Migration principal:

- `202608131200_add_rental_item_returns.sql`

### Lote 3C — concorrência e billing final

Concluído e aprovado no IURQ.

Migrations:

- `202608131300_protect_rental_asset_bookings.sql`
- `202608131400_restrict_rental_booking_function_execute.sql`

Validações finais do Lote 3C:

- Security Advisor sem alerta novo causado pelo lote;
- testes focais passando;
- TypeScript sem erros;
- `git diff --check` aprovado para os arquivos de texto;
- teste real de concorrência no PostgreSQL aprovado: a segunda transação aguardou o lock da primeira e, após o commit, foi rejeitada por conflito;
- período não conflitante permitido;
- intervalo fechado confirmado: término e novo início no mesmo dia geram conflito;
- funções internas do Lote 3C sem `EXECUTE` para `PUBLIC`, `anon`, `authenticated` e `service_role`, mantendo os triggers funcionais.

## Git / PR atual

Commit consolidado enviado:

`dfc624b4cf2cfc493508318277fb26f64181448b`

Mensagem:

`feat: add rental contracts control workflows`

Branch remota:

`origin/codex/controle-locacoes`

PR aberto contra `main`:

- PR #2;
- o PR acumula também mudanças anteriores de outros módulos que ainda não estavam integradas à `main`;
- não fazer merge automaticamente apenas porque o PR está tecnicamente mergeável;
- preparar a produção/MISFY antes de qualquer merge que possa resultar em deploy da aplicação.

## Regras operacionais importantes

- Worktree obrigatório para essa linha de trabalho:
  `C:\tmp\Sistema_Pedidos_Radial-unificar-transformador`
- Não usar a pasta antiga do OneDrive.
- Não tocar `.next-bloqueada-20260804/`.
- O usuário prefere iniciar o Next manualmente no Windows em `http://localhost:3001` quando QA de UI for realmente necessário.
- Não gastar tempo tentando iniciar/manter o Next dentro do sandbox.
- Não usar `service_role` como atalho para QA funcional.
- Não executar commit, merge ou deploy sem etapa explícita.

## Próximo passo recomendado

Antes de integrar o PR #2 à `main`, revisar a preparação de produção:

1. confirmar exatamente quais migrations ainda faltam no MISFY;
2. preparar aplicação segura dessas migrations na produção;
3. validar compatibilidade do código com o estado do banco de produção;
4. só depois decidir pelo merge/deploy.
