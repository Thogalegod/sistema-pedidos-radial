# AI Agent Development Workflow Design

## Objective

Create a development workflow for Sistema_Pedidos_Radial that reduces manual relay between ChatGPT, Codex, and coding agents; accelerates feature delivery; improves test/review quality; and minimizes unnecessary model/token usage.

The intended user experience is:

1. The user describes a feature in normal language.
2. The agent team explores the existing system without changing it.
3. The leader presents a short product-facing plan containing only decisions that affect behavior, UX, data, permissions, scope, or material risk.
4. The user approves or adjusts that plan.
5. After approval, the team implements, tests, fixes, and independently reviews the feature autonomously.
6. The team stops only when automated gates are green or when a new product/business decision is genuinely required.
7. The user manually tests the finished feature.
8. After the user says `aprovado`, the team may commit, push, and complete the approved IURQ development/homologation actions automatically.
9. MISFY production remains blocked until the user gives explicit production authorization.

## Core Principles

- Optimize for development speed without sacrificing correctness or safety.
- Keep the user involved in product/business decisions, not low-level programming decisions.
- Do not require the user to copy responses continuously between ChatGPT and coding tools.
- Use the smallest amount of agent/model work needed for each task.
- Keep decisions, workflow rules, and checkpoints in the repository so Codex, Claude Code, GLM, and future agents can resume consistently.
- Git/GitHub is the source of truth for recoverable development state across machines.
- IURQ is development/homologation. MISFY is protected production.

## Environments

### IURQ

- Project ref: `iurqgskfuupslrghgtej`.
- Development/homologation environment.
- After the user approves a feature plan, agents may perform approved IURQ operations required to implement and validate that feature, including applying its required migration when automated/manual validation needs the remote schema.
- IURQ operations must remain within the scope of the approved feature.

### MISFY

- Production environment.
- No agent may access, mutate, migrate, deploy, or otherwise alter MISFY without explicit user authorization for that production action.
- Passing tests, reviews, or IURQ validation never implies authorization for MISFY.

## Human Approval Model

### Gate 1 — Product Plan Approval

Before implementing a new feature, the leader must explore the relevant existing code and present a concise plan.

The plan should emphasize decisions the user needs to understand, for example:

- PDF versus image attachments;
- who may view/edit/delete something;
- whether history is preserved;
- user-visible workflow and statuses;
- data retention or destructive behavior;
- new business rules;
- material security/privacy implications.

The leader should not ask the user about ordinary technical choices such as helper names, loop constructs, internal file placement, index implementation details, or test mechanics unless those choices materially change product behavior or risk.

Implementation starts only after explicit user approval of the plan.

### Autonomous Execution After Plan Approval

After Gate 1 approval, the team may autonomously:

- explore relevant files;
- modify application code;
- add or update tests;
- create migrations required by the approved feature;
- apply those migrations to IURQ when necessary for validation;
- run local and IURQ-backed tests;
- run E2E validation when relevant;
- fix implementation/test failures;
- perform independent code/security/database review;
- repeat the implementation → test → review loop until all required gates pass.

The team should interrupt the user only if it discovers a new decision that changes behavior, UX, stored data, permissions, scope, destructive effects, or material risk.

### Gate 2 — Manual User Test

When automated gates and independent review are green, the team reports `PRONTO PARA TESTE MANUAL` with a concise summary of what changed and what the user should verify.

The user tests the application manually.

If the user reports a problem, the team resumes the autonomous fix/test/review loop.

### Gate 3 — User Approval

When the user says `aprovado` after manual testing, the team may automatically:

- perform selective staging of the approved feature;
- run final staged-content gates;
- commit;
- push the feature branch;
- synchronize the GitHub checkpoint;
- complete any already-approved IURQ development/homologation actions needed for the feature.

This authorization does not extend to MISFY.

## Branch and Multi-PC Model

### Stable Base

The current stable development line is `codex/controle-locacoes` unless a later repository checkpoint explicitly changes it.

### One Branch Per Feature

Every new feature/fix should normally use an isolated branch created from the synchronized stable development base, for example:

- `feat/manutencao-preventiva`
- `feat/historico-boleto`
- `fix/cobranca-duplicada`

Agents manage branch creation and synchronization automatically after confirming the base is current.

### Worktrees for Parallel Agent Work

When parallel writable work is genuinely useful, use isolated Git worktrees so agents do not overwrite one another. Read-only exploration/review agents do not require writable worktrees unless their tooling requires isolation.

Do not create multiple writable agents editing the same working tree concurrently.

### Work PC and Home PC

No always-on server is required.

Both computers use independent local clones/worktrees of the same GitHub repository. GitHub is the recoverable source of truth.

Before work starts on either computer, the workflow must:

1. fetch the remote state;
2. identify the active feature branch and upstream;
3. verify ahead/behind/diverged state;
4. fast-forward only when safe;
5. stop rather than inventing a merge when local unsynchronized changes conflict with remote work.

Before switching computers, recoverable feature state must be committed/pushed to GitHub. Local secrets such as `.env.local` remain local to each computer and must never be committed.

A computer may be turned off. Work resumes on another computer by synchronizing the same feature branch and reading repository checkpoints.

## Agent Team

### Leader / Orchestrator

Responsibilities:

- receive the user's feature request;
- classify task size/risk;
- dispatch only the agents actually needed;
- gather exploration results;
- produce the concise product-facing plan;
- wait for Gate 1 approval;
- coordinate autonomous implementation, testing, review, and retry loops;
- stop only on a genuine product decision, blocker, or completed gate state.

The leader should avoid re-reading large parts of the repository when a specialist can return a focused summary.

### Explorer

Default mode: read-only.

Responsibilities:

- locate relevant files and existing patterns;
- identify dependencies and nearby tests;
- return a concise map of the relevant code rather than dumping large file contents into the leader context.

### Implementer

Writable agent responsible for the primary implementation.

Responsibilities:

- implement the approved plan;
- follow existing repository patterns;
- make the smallest coherent change;
- avoid unrelated refactors;
- create/update tests as required by the implementation workflow.

Normally only one primary implementer writes a given feature area at a time.

### Database Agent

Use only when the feature touches Supabase, schema, RLS, RPCs, grants, Storage, migrations, integrity, concurrency, or data lifecycle.

Responsibilities:

- review/design database changes;
- verify RLS/grants/security boundaries;
- assess migration safety and consistency;
- validate IURQ-only remote operations.

### Security Agent

Use for security-sensitive features or when permissions/data exposure are involved.

Responsibilities:

- inspect privilege boundaries;
- look for cross-organization data leaks;
- review sensitive financial fields and Storage access;
- review `SECURITY DEFINER`, grants, and escalation paths when relevant.

By default this agent reviews rather than writes.

### Tester

Responsibilities:

- determine the smallest relevant test set during iteration;
- add/update tests when required;
- run targeted tests first;
- run broader/final gates when the implementation stabilizes;
- attempt realistic regressions and negative paths;
- return actionable failures to the implementer.

### Independent Reviewer

Default mode: read-only.

Inputs should be focused on:

- approved requirement/plan;
- resulting diff;
- test results;
- only the surrounding files needed to verify behavior.

Responsibilities:

- check that implementation matches the approved plan;
- identify regressions, incomplete cases, scope creep, debug residue, secrets, unsafe migrations, or permission mistakes;
- reject the change back to the implementer when needed.

The implementer must not be the sole approver of its own work.

## Adaptive Agent/Token Policy

Do not use every agent for every task.

### Small task

Typical path:

`Implementer → focused check`

### Medium task

Typical path:

`Explorer → Implementer → Tester/Reviewer`

### Large task

Typical path:

`focused parallel exploration/specialists → Implementer → Tester + Reviewer → gates`

### Database/security-critical task

Typical path:

`Explorer + Database + Security → Implementer → Tester + independent Reviewer → IURQ/E2E gates`

Token/context optimization rules:

- use GLM-5.3 for implementation, difficult debugging, architecture, and critical review;
- use the configured smaller model for lightweight lookup/summarization when Claude Code routes such work appropriately;
- do not ask multiple agents to read the entire repository;
- explorers return summaries and exact relevant paths;
- reviewers consume the approved plan + diff first and expand context only when needed;
- use targeted tests during iteration and broader gates only at meaningful checkpoints;
- persist stable rules and checkpoints in repository files instead of repeating large prompts.

## Required Repository Configuration

The implementation phase should introduce a minimal, maintainable set of repository-owned configuration, expected to include:

- `AGENTS.md` — model/tool-neutral project rules and safety constraints;
- `CLAUDE.md` — Claude Code orchestration instructions and references to shared rules;
- `.claude/agents/` — focused agent role definitions;
- `.claude/settings.json` or equivalent project settings only where useful and safe;
- `docs/AI_CHECKPOINT.md` — compact current recoverable project/workflow checkpoint;
- `scripts/gates/` or equivalent scripts — deterministic checks that agents can run without re-describing them in prompts.

The implementation plan must inspect current repository patterns before fixing exact filenames/scripts and must avoid duplicating existing mechanisms.

## Automated Gates

The implementation plan should create deterministic gates appropriate to this Next.js/Supabase repository. At minimum, the final feature workflow must be able to verify:

- Git identity/synchronization and feature-branch isolation;
- no accidental secrets or generated artifacts in staged content;
- TypeScript correctness;
- relevant automated tests;
- relevant database/security checks for database-sensitive changes;
- E2E/IURQ validation when the feature requires it;
- staged diff hygiene (`git diff --cached --check` or equivalent);
- independent reviewer approval.

The gates should be cheap during iteration and stricter at finalization.

A failing gate returns the task to the implementation loop automatically rather than immediately asking the user what to do.

## Existing Local-State Safety

The repository has historically contained legitimate pre-existing local modifications and generated Playwright/Next artifacts. Automation must never assume `git status` must be clean.

Rules:

- never use blanket destructive cleanup to make the worktree look clean;
- never use `git add .` or `git add -A` for feature finalization;
- classify and stage explicit approved paths;
- preserve unrelated modified/untracked files;
- stop on ambiguity instead of silently discarding local work.

## Codex Fallback

Codex remains a supported backup engine when Z.ai/GLM quota is exhausted or when a second independent model is useful.

Fallback must not depend on copying full chat history. Codex resumes from:

- Git branch/commit state;
- `AGENTS.md`;
- `docs/AI_CHECKPOINT.md`;
- feature plan/spec when applicable;
- current diffs and test evidence.

This makes model/provider switching a workflow detail rather than a project-state migration.

## Deferred Mobile Control

Mobile/Telegram control is intentionally deferred until the core local multi-agent workflow is proven stable.

Possible future options include GitHub Mobile status/approval flows or a dedicated messaging bridge, but they must not add operational complexity until they demonstrably save more time than they cost to maintain.

## Success Criteria

The new workflow is successful when:

1. The user can request a feature in normal language.
2. The system presents a short, understandable behavior/business plan for approval.
3. After approval, implementation/testing/review proceeds without continuous user relaying between agents.
4. The user is interrupted only for new material product/business/risk decisions.
5. The user receives a feature only after deterministic automated gates and independent review pass.
6. Manual approval triggers safe commit/push/IURQ completion without requiring routine Git commands from the user.
7. MISFY remains explicitly human-gated.
8. Work can resume safely from either the work PC or home PC with no always-on server.
9. The workflow uses specialized, scoped agent context to reduce avoidable token consumption.
10. Codex can take over from GLM using repository state rather than copied conversation history.
