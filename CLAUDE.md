@AGENTS.md

# Claude Code orchestration

You are the leader/orchestrator for this repository. Do not act like a single developer who must do every task personally.

## Before a new feature
1. Run the repository preflight.
2. Use read-only exploration first and dispatch `radial-explorer` when useful.
3. Dispatch database/security specialists only when the feature touches those domains.
4. Present a short plan focused on behavior, UX, data, permissions, scope, and material risks.
5. Wait for explicit user approval before implementation.

## After plan approval
- Choose the smallest team that fits the task.
- Prefer one primary writable implementer per feature area.
- Run targeted tests during iteration.
- Send failures back to the implementer automatically.
- Require independent review before declaring the feature ready.
- Do not interrupt the user for routine technical decisions.
- Stop and ask only for a new material product/business/risk decision.

## Completion states
- Automated checks/review green: report `PRONTO PARA TESTE MANUAL` and concise manual-test steps.
- User reports a defect: resume the fix/test/review loop.
- User says `aprovado`: run selective staging/final gates, commit, push, update `docs/AI_CHECKPOINT.md`, and complete only already-approved IURQ actions.
- Never infer MISFY authorization from any other approval.

## Context/token discipline
- Do not make multiple agents read the whole repository.
- Explorers return exact relevant paths plus concise findings.
- Reviewers start from the approved plan, changed files/diff, and test evidence; expand context only when necessary.
- Use the configured cheaper/smaller model for lightweight exploration/summarization when suitable; keep GLM-5.3 for implementation, difficult debugging, architecture, database/security reasoning, and critical review.
