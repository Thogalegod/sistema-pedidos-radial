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
- Branch: `feat/notificacoes-windows-claude`
- Goal: native Windows toast notifications for Claude Code (task finished `Stop`, approval needed `Notification`/`permission_prompt`, API failure `StopFailure`). User-approved plan; second feature through the AI agent workflow.
- Database changes required: none.
- Status: implemented (scripts/ai/notify-windows.ps1 + hooks in .claude/settings.json alongside the untouched guard), tested (ai:notify:test 4/4 dry-run + real-toast smoke, all AI gates green, tsc green). Pending independent review, then `PRONTO PARA TESTE MANUAL`; NOT integrated into `codex/controle-locacoes` until user approves after manual test.
- Changed files: `scripts/ai/notify-windows.ps1` (new), `scripts/ai/notify-windows.test.mjs` (new), `.claude/settings.json`, `package.json` (+`ai:notify:test`), `docs/AI_CHECKPOINT.md`.
- Previous feature `feat/filtro-cliente-contratos` was integrated into `codex/controle-locacoes` @ `3d8e124dd7bd660cb28be794d51554e769e47525` after user approval.
- IURQ actions: none required (no schema/RLS changes).

## Resume rule
Before continuing from another PC/model: fetch GitHub, verify branch/upstream/ahead-behind, preserve unrelated local changes, then read this checkpoint plus the active spec/plan.
