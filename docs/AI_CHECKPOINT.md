# AI Development Checkpoint

## Stable base
- Repository: `Thogalegod/sistema-pedidos-radial`
- Base branch: `codex/controle-locacoes`
- Last closed functional lot: Lote B boleto/cobranças — commit `188c40ac06d9282f71db5d0fb2fd7e52773cacf2`
- Workflow design (ativo): `docs/superpowers/specs/2026-08-27-radial-agent-skills-workflow-design.md`
- Workflow implementation plan (ativo): `docs/superpowers/plans/2026-08-27-radial-agent-skills-workflow-implementation.md`

## Environments
- IURQ: `iurqgskfuupslrghgtej` — desenvolvimento/homologação
- MISFY: `misfyiznwnuvldoccciw` — produção protegida, autorização explícita e separada por ação

## Current workflow work
- Tasks 1–4 do plano 2026-08-27 executadas: `AGENTS.md` curto + skills canônicas em `.agents/skills/`; legado multiagente (subagentes, regras path-scoped, hook automático de tool call e utilitários órfãos) removido; `CLAUDE.md` reduzido a ponteiro; `staged-gate` preservado (`ai:gate:staged`/`ai:gate:test`).
- Task 5 (staging seletivo + `npm run ai:gate:staged` + commit + push) PENDENTE de aprovação humana após o teste manual.
- Database changes required: none. IURQ/MISFY não acessados.

## Resume rule
Antes de continuar de outro PC/modelo: fetch GitHub, verificar branch/upstream/ahead-behind, preservar untracked deliberados, ler este checkpoint + spec/plano ativos.
