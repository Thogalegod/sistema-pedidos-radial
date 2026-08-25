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
- Branch: `chore/ai-agent-workflow`
- Goal: install/validate repository-owned Claude Code + GLM multi-agent orchestration.
- Database changes required for this workflow: none.
- Status: project agents/settings/gates passed local smoke validation (agent discovery, read-only orchestration up to the approval gate, PreToolUse blocks for `git add .` and the MISFY ref). Infrastructure branch ready for user workflow test/integration.

## Resume rule
Before continuing from another PC/model: fetch GitHub, verify branch/upstream/ahead-behind, preserve unrelated local changes, then read this checkpoint plus the active spec/plan.
