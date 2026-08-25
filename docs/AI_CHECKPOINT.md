# AI Development Checkpoint

## Stable base
- Repository: `Thogalegod/sistema-pedidos-radial`
- Base branch: `codex/controle-locacoes`
- Last closed functional lot: Lote A boleto/billing
- Lote A commit: `a219aa5f6a098ac6b8ed05e667fa5d5d397980f0`
- Workflow design: `docs/superpowers/specs/2026-08-25-ai-agent-development-workflow-design.md`
- Workflow implementation plan: `docs/superpowers/plans/2026-08-25-ai-agent-development-workflow.md`

## Environments
- IURQ: `iurqgskfuupslrghgtej` — development/homologation
- MISFY: `misfyiznwnuvldoccciw` — protected production, explicit authorization required

## Current workflow work
- Branch: `feat/filtro-cliente-contratos`
- Goal: add a "Cliente" filter to the rental contracts list (user-approved feature, first feature run through the AI agent workflow).
- Database changes required: none.
- Status: implemented, tested (16 targeted tests), independently reviewed (APPROVE), user-approved (`aprovado` 2026-08-25); committed and pushed to `origin/feat/filtro-cliente-contratos`. NOT yet integrated into `codex/controle-locacoes` — user explicitly deferred integration.
- Changed files: `src/app/contratos-locacoes/contratos/page.tsx`, `src/app/contratos-locacoes/contratos/page.test.tsx` (new), `src/lib/contratos-locacoes/queries.ts`, `src/lib/contratos-locacoes/queries.test.ts`.
- IURQ actions: none required (no schema/RLS changes).

## Resume rule
Before continuing from another PC/model: fetch GitHub, verify branch/upstream/ahead-behind, preserve unrelated local changes, then read this checkpoint plus the active spec/plan.
