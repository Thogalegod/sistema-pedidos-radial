<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Sistema_Pedidos_Radial shared rules

- Stable development base: `codex/controle-locacoes` unless `docs/AI_CHECKPOINT.md` explicitly changes it.
- IURQ `iurqgskfuupslrghgtej` is development/homologation.
- MISFY `misfyiznwnuvldoccciw` is protected production. Never access, mutate, migrate, deploy, or otherwise alter MISFY without explicit user authorization for that production action.
- Preserve unrelated local work. Never use blanket cleanup to make `git status` clean.
- Never use `git add .` or `git add -A` for feature finalization; stage explicit reviewed paths only.
- Do not start, restart, or kill the Next development server unless an approved task explicitly requires it. The user normally owns the server process.
- New feature flow: explore read-only → present a short behavior/business plan → wait for user approval → implement/test/review autonomously → report `PRONTO PARA TESTE MANUAL` → wait for the user test → after user says `aprovado`, selectively commit/push and complete already-approved IURQ actions.
- Do not ask the user about ordinary internal technical choices. Ask only when a newly discovered choice changes behavior, UX, stored data, permissions, scope, destructive effects, or material risk.
- Use the smallest relevant test set while iterating; run broader gates only at meaningful checkpoints.
- Read `docs/AI_CHECKPOINT.md` at the start of continuation/resume work.
- Prefer repository state/specs/plans/checkpoints over copied chat history so Codex, Claude Code, GLM, and future agents can hand work off safely.
