# AI Agent Development Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved Claude Code + GLM-5.3 multi-agent workflow so the user approves product-facing plans once, then agents implement/test/review autonomously until manual test, with safe Git/IURQ automation and MISFY hard-blocked.

**Architecture:** Keep the current `codex/controle-locacoes` worktree untouched and implement the infrastructure in an isolated `chore/ai-agent-workflow` worktree. Reuse the existing root `AGENTS.md` and `CLAUDE.md`, add concise shared rules, project-scoped Claude agents, deterministic Node-based safety/gate scripts, and project settings/hooks. The main Claude conversation is the leader/orchestrator; specialized subagents keep exploration/review context separate to reduce token use.

**Tech Stack:** Claude Code 2.1.245+, Z.ai GLM-5.3 main model with configured smaller model for cheap subagents, Node.js 18+, Git/GitHub, Next.js 16.2.4, TypeScript 5, Vitest 4.1.9, Playwright 1.62.1, Supabase CLI/PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-08-25-ai-agent-development-workflow-design.md`

## Global Constraints

- Stable development base: `codex/controle-locacoes`.
- IURQ project ref: `iurqgskfuupslrghgtej` = development/homologation.
- MISFY project ref: `misfyiznwnuvldoccciw` = protected production; never access or mutate without explicit user authorization for production.
- Preserve existing unrelated local modifications/untracked artifacts; never use `git reset`, `git clean`, `git stash`, destructive checkout/restore, `git add .`, or `git add -A` to make state look clean.
- The user controls the Next development server; agents do not start/restart/kill it unless a later approved plan explicitly changes that rule.
- New product features follow: explore → short product plan → user approval → autonomous implementation/test/review → `PRONTO PARA TESTE MANUAL` → user test → user `aprovado` → selective commit/push/IURQ completion.
- Ordinary technical implementation choices do not interrupt the user. New business/UX/data/permission/material-risk decisions do.
- No IURQ database operation is needed for this infrastructure implementation itself.
- Keep `CLAUDE.md` concise; move path-specific rules into `.claude/rules/` to reduce startup context.
- Do not use Claude Agent Teams in v1. Use stable custom subagents only.

---

## Task 1: Create an isolated implementation worktree without touching current local state

**Files:**
- No repository file changes yet.
- New local worktree: `C:\tmp\Sistema_Pedidos_Radial-ai-agent-workflow`
- New branch: `chore/ai-agent-workflow`

**Interfaces:**
- Consumes: remote `origin/codex/controle-locacoes` containing the approved workflow spec and this plan.
- Produces: clean isolated checkout for all following tasks.

- [ ] **Step 1: Inspect the existing worktree without modifying it**

Run from `C:\tmp\Sistema_Pedidos_Radial-unificar-transformador`:

```powershell
git status --short
git branch --show-current
git rev-parse HEAD
git fetch origin
git rev-list --left-right --count HEAD...origin/codex/controle-locacoes
```

Expected: branch is `codex/controle-locacoes`; local unrelated modified/untracked items may exist and must remain untouched. Remote may be ahead because the workflow spec/plan were committed from GitHub.

- [ ] **Step 2: Verify the target worktree path does not already contain unrelated work**

```powershell
if (Test-Path 'C:\tmp\Sistema_Pedidos_Radial-ai-agent-workflow') { Get-ChildItem 'C:\tmp\Sistema_Pedidos_Radial-ai-agent-workflow' -Force }
```

Expected: path absent, or empty and clearly safe. If it contains unrelated files, stop and report rather than deleting them.

- [ ] **Step 3: Create the isolated worktree directly from the current remote base**

```powershell
git worktree add 'C:\tmp\Sistema_Pedidos_Radial-ai-agent-workflow' -b chore/ai-agent-workflow origin/codex/controle-locacoes
```

Expected: new worktree created without changing the original dirty worktree.

- [ ] **Step 4: Verify identity inside the new worktree**

```powershell
Set-Location 'C:\tmp\Sistema_Pedidos_Radial-ai-agent-workflow'
git branch --show-current
git rev-parse HEAD
git status --short
```

Expected: branch `chore/ai-agent-workflow`; status clean.

- [ ] **Step 5: Push only the new branch and establish upstream**

```powershell
git push -u origin chore/ai-agent-workflow
```

Expected: upstream is `origin/chore/ai-agent-workflow` and local/remote are `0 ahead / 0 behind`.

---

## Task 2: Turn existing root instructions into a concise shared contract

**Files:**
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Create: `docs/AI_CHECKPOINT.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: existing Next.js warning already present in `AGENTS.md`; existing `CLAUDE.md` import of `@AGENTS.md`.
- Produces: model-neutral rules for Codex/other agents plus Claude-specific orchestration and a compact recoverable checkpoint.

- [ ] **Step 1: Record the existing instruction files before editing**

Run:

```powershell
Get-Content AGENTS.md
Get-Content CLAUDE.md
```

Expected: `AGENTS.md` contains the existing Next.js agent-rules block; `CLAUDE.md` imports `@AGENTS.md`. Preserve both behaviors.

- [ ] **Step 2: Extend `AGENTS.md` without removing the Next.js block**

Append a concise section with these exact invariants:

```markdown
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
```

- [ ] **Step 3: Expand `CLAUDE.md` as the leader/orchestrator contract**

Use exactly this structure, keeping the existing import first:

```markdown
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
```

- [ ] **Step 4: Create the initial `docs/AI_CHECKPOINT.md`**

Write a compact checkpoint containing:

```markdown
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

## Resume rule
Before continuing from another PC/model: fetch GitHub, verify branch/upstream/ahead-behind, preserve unrelated local changes, then read this checkpoint plus the active spec/plan.
```

- [ ] **Step 5: Ensure personal Claude settings cannot be committed accidentally**

Append to `.gitignore`:

```gitignore
# Claude Code local/personal state
/.claude/settings.local.json
/CLAUDE.local.md
```

- [ ] **Step 6: Verify these files contain the intended invariants**

```powershell
node -e "const fs=require('fs'); const a=fs.readFileSync('AGENTS.md','utf8'); const c=fs.readFileSync('CLAUDE.md','utf8'); const p=fs.readFileSync('docs/AI_CHECKPOINT.md','utf8'); if(!a.includes('iurqgskfuupslrghgtej')||!a.includes('misfyiznwnuvldoccciw')||!c.startsWith('@AGENTS.md')||!p.includes('a219aa5f6a098ac6b8ed05e667fa5d5d397980f0')) process.exit(1);"
```

Expected: exit code 0.

- [ ] **Step 7: Commit only this task's files**

```powershell
git add AGENTS.md CLAUDE.md docs/AI_CHECKPOINT.md .gitignore
git diff --cached --check
git commit -m "chore: define shared AI development rules"
```

---

## Task 3: Add path-scoped Claude rules to save context and harden sensitive areas

**Files:**
- Create: `.claude/rules/supabase-safety.md`
- Create: `.claude/rules/testing.md`
- Create: `.claude/rules/git-workflow.md`

**Interfaces:**
- Consumes: global shared rules from `AGENTS.md`.
- Produces: rules that load only when relevant paths are touched, reducing startup-context waste.

- [ ] **Step 1: Create `.claude/rules/supabase-safety.md`**

```markdown
---
paths:
  - "supabase/**/*"
  - "src/**/*.{ts,tsx}"
---

# Supabase safety

- IURQ project ref is `iurqgskfuupslrghgtej` and is the only remote Supabase environment allowed after an approved feature plan.
- MISFY project ref is `misfyiznwnuvldoccciw`; never access or mutate it without explicit production authorization.
- For schema/RLS/RPC/grant/Storage changes, use `radial-database` and `radial-security` review before final approval.
- Treat `SECURITY DEFINER`, broad grants, cross-organization joins, financial fields, Storage policies, and race/concurrency logic as security-sensitive.
- Never expose service-role/secret credentials in code, logs, diffs, or prompts.
- Apply only migrations that belong to the approved feature and verify the target project ref first.
```

- [ ] **Step 2: Create `.claude/rules/testing.md`**

```markdown
---
paths:
  - "src/**/*.{ts,tsx}"
  - "e2e/**/*.ts"
  - "supabase/tests/**/*"
---

# Testing workflow

- Prefer targeted tests while iterating; do not rerun broad E2E after every small edit.
- Before `PRONTO PARA TESTE MANUAL`, require TypeScript plus all tests relevant to the changed behavior.
- For browser-visible/permission/Storage workflows, run focused Playwright against the user's existing server when `E2E_BASE_URL` is supplied; do not restart that server.
- Database/security-sensitive features require their relevant static/pgTAP/integration checks plus independent database/security review.
- A failed test returns to the implementation loop automatically unless it reveals a new product/business decision.
```

- [ ] **Step 3: Create `.claude/rules/git-workflow.md`**

```markdown
# Git workflow

- GitHub is the recoverable source of truth between work PC and home PC.
- Create one isolated `feat/*`, `fix/*`, or `chore/*` branch per unit of work from a synchronized base.
- Before work: fetch, verify upstream and ahead/behind/diverged state. Fast-forward only when safe.
- Never discard unrelated local changes to synchronize.
- Use explicit staging paths only. Never `git add .` or `git add -A`.
- Do not merge/rebase automatically when branch history diverges; report the blocker.
- Writable parallel agents must not edit the same worktree concurrently.
```

- [ ] **Step 4: Verify rule files exist and path-scoped frontmatter parses visibly**

```powershell
Get-Content .claude/rules/supabase-safety.md -TotalCount 8
Get-Content .claude/rules/testing.md -TotalCount 8
Get-Content .claude/rules/git-workflow.md -TotalCount 8
```

Expected: frontmatter on the two path-scoped rules; git rule intentionally global.

- [ ] **Step 5: Commit the rules**

```powershell
git add .claude/rules/supabase-safety.md .claude/rules/testing.md .claude/rules/git-workflow.md
git diff --cached --check
git commit -m "chore: add scoped AI workflow rules"
```

---

## Task 4: Define the project subagent team with restricted responsibilities

**Files:**
- Create: `.claude/agents/radial-explorer.md`
- Create: `.claude/agents/radial-implementer.md`
- Create: `.claude/agents/radial-tester.md`
- Create: `.claude/agents/radial-reviewer.md`
- Create: `.claude/agents/radial-database.md`
- Create: `.claude/agents/radial-security.md`

**Interfaces:**
- Consumes: root/project rules and approved feature plan supplied by the leader.
- Produces: focused reusable workers. The main conversation remains the leader/orchestrator.

- [ ] **Step 1: Create the cheap read-only explorer**

`.claude/agents/radial-explorer.md`:

```markdown
---
name: radial-explorer
description: Read-only codebase explorer for locating the smallest relevant set of files, patterns, tests, and dependencies before planning or implementation. Use proactively for medium/large tasks; do not use for trivial edits.
tools: Read, Glob, Grep
model: haiku
permissionMode: plan
effort: low
---

Explore only what is necessary for the requested feature. Return exact paths, important symbols, existing patterns, relevant tests, and concrete risks. Do not dump large file contents. Do not propose unrelated refactors. Never modify files.
```

- [ ] **Step 2: Create the primary implementer**

`.claude/agents/radial-implementer.md`:

```markdown
---
name: radial-implementer
description: Primary writable implementation agent. Use only after the user has approved the product-facing plan. Implements the smallest coherent change and its tests.
tools: Read, Glob, Grep, Edit, Write, Bash, PowerShell
model: inherit
permissionMode: auto
effort: high
---

Implement only the approved scope. Follow existing patterns and Next.js rules. Prefer TDD for behavior changes. Do not make unrelated refactors. Do not touch MISFY. Do not use blanket Git cleanup or staging. During iteration run the smallest relevant test set. When a test/reviewer finds a defect, fix it without asking the user unless the fix requires a new product/business/UX/data/permission/material-risk decision.
```

- [ ] **Step 3: Create the tester**

`.claude/agents/radial-tester.md`:

```markdown
---
name: radial-tester
description: Test specialist used after implementation or for difficult regressions. Runs targeted tests first, adds/updates test files when necessary, and tries realistic negative/regression paths.
tools: Read, Glob, Grep, Edit, Write, Bash, PowerShell
model: inherit
permissionMode: auto
effort: medium
---

Focus on tests and verification. Do not rewrite product code except test-only helpers/fixtures unless explicitly asked by the leader. Start with the smallest relevant test set. Escalate to broader Vitest/E2E/database checks only when the implementation is stable or the risk warrants it. Return concise actionable failures; do not paste huge logs when a short root-cause excerpt is enough.
```

- [ ] **Step 4: Create the independent reviewer**

`.claude/agents/radial-reviewer.md`:

```markdown
---
name: radial-reviewer
description: Independent final reviewer. Use after implementation/tests and before declaring a feature ready for manual test. Reviews approved plan, changed files, and evidence; never implements fixes itself.
tools: Read, Glob, Grep
model: inherit
permissionMode: plan
effort: high
---

Review independently. Verify the result matches the approved behavior and look for regressions, missing cases, scope creep, debug residue, secrets, generated artifacts, unsafe permissions/data exposure, and test gaps. Start from the approved plan and changed files; expand context only as necessary. Return APPROVE or REJECT with specific actionable findings. Never modify files.
```

- [ ] **Step 5: Create the database specialist**

`.claude/agents/radial-database.md`:

```markdown
---
name: radial-database
description: Read-only Supabase/PostgreSQL specialist for migrations, schema, RLS, RPCs, grants, Storage, concurrency, integrity, and data lifecycle. Use only when a feature touches these areas.
tools: Read, Glob, Grep
model: inherit
permissionMode: plan
effort: high
---

Review database design and migration safety. Verify organization isolation, RLS/grants, RPC signatures, Storage policy boundaries, concurrency/integrity, and migration consistency. IURQ is development/homologation. MISFY is forbidden without explicit production authorization. Return concrete design/review findings; do not modify files.
```

- [ ] **Step 6: Create the security specialist**

`.claude/agents/radial-security.md`:

```markdown
---
name: radial-security
description: Read-only security reviewer for permissions, privilege escalation, cross-organization exposure, financial fields, Storage access, SECURITY DEFINER, secrets, and destructive behavior.
tools: Read, Glob, Grep
model: inherit
permissionMode: plan
effort: high
---

Review only security-relevant scope. Look for privilege escalation, overly broad grants/policies, cross-organization access, financial-data leakage, unsafe Storage access, SECURITY DEFINER/search_path issues, secret leakage, and destructive paths. Return concise severity-ranked findings. Never modify files and never access MISFY.
```

- [ ] **Step 7: Validate all agent definitions with Claude Code itself**

```powershell
claude plugin validate .claude/agents
```

Expected: all six files parse/load without duplicate names or invalid frontmatter. Claude Code 2.1.245 satisfies the documented validator requirement.

- [ ] **Step 8: Commit the agent definitions**

```powershell
git add .claude/agents/radial-explorer.md .claude/agents/radial-implementer.md .claude/agents/radial-tester.md .claude/agents/radial-reviewer.md .claude/agents/radial-database.md .claude/agents/radial-security.md
git diff --cached --check
git commit -m "chore: add Radial Claude subagents"
```

---

## Task 5: Add a deterministic PreToolUse safety guard before granting autonomy

**Files:**
- Create: `scripts/ai/guard-tool-call.mjs`
- Create: `scripts/ai/guard-tool-call.test.mjs`
- Create: `.claude/settings.json`

**Interfaces:**
- Consumes: Claude Code PreToolUse JSON from stdin.
- Produces: JSON block decisions for forbidden MISFY/destructive Git/secret-file actions; otherwise exits successfully with no block.

- [ ] **Step 1: Write RED tests for forbidden and allowed calls**

Create `scripts/ai/guard-tool-call.test.mjs` using Node's built-in `node:test`. It must spawn `node scripts/ai/guard-tool-call.mjs`, feed JSON on stdin, parse stdout when present, and assert:

```javascript
const forbidden = [
  { tool_name: 'PowerShell', tool_input: { command: 'git add .' } },
  { tool_name: 'Bash', tool_input: { command: 'git add -A' } },
  { tool_name: 'PowerShell', tool_input: { command: 'git reset --hard HEAD~1' } },
  { tool_name: 'PowerShell', tool_input: { command: 'git clean -fd' } },
  { tool_name: 'Bash', tool_input: { command: 'git stash' } },
  { tool_name: 'Bash', tool_input: { command: 'git rebase origin/main' } },
  { tool_name: 'Bash', tool_input: { command: 'npx supabase db push --project-ref misfyiznwnuvldoccciw' } },
  { tool_name: 'Write', tool_input: { file_path: 'C:\\repo\\.env.local', content: 'SECRET=x' } },
  { tool_name: 'Edit', tool_input: { file_path: 'C:\\repo\\.env.production', old_string: 'a', new_string: 'b' } },
];

const allowed = [
  { tool_name: 'PowerShell', tool_input: { command: 'git status --short' } },
  { tool_name: 'PowerShell', tool_input: { command: 'git add AGENTS.md CLAUDE.md' } },
  { tool_name: 'Bash', tool_input: { command: 'npx tsc --noEmit --pretty false' } },
  { tool_name: 'Write', tool_input: { file_path: 'C:\\repo\\.env.example', content: 'NEXT_PUBLIC_X=' } },
  { tool_name: 'Edit', tool_input: { file_path: 'C:\\repo\\src\\x.ts', old_string: 'a', new_string: 'b' } },
];
```

Forbidden calls must return `{ "decision": "block", "reason": "..." }`; allowed calls must exit 0 without a block decision.

- [ ] **Step 2: Run tests and verify they fail because the guard does not exist**

```powershell
node --test scripts/ai/guard-tool-call.test.mjs
```

Expected: FAIL due missing implementation.

- [ ] **Step 3: Implement `scripts/ai/guard-tool-call.mjs`**

The implementation must:

1. Read stdin JSON.
2. Normalize `tool_name` and the shell `command`/file `file_path`.
3. Block commands containing `misfyiznwnuvldoccciw` (case-insensitive).
4. For Bash/PowerShell, block regexes for:
   - `git add .`
   - `git add -A`
   - `git reset`
   - `git clean`
   - `git stash`
   - `git rebase`
   - destructive `git checkout --` / `git restore`
5. Before any command containing `supabase`, if `supabase/.temp/project-ref` exists and trims to `misfyiznwnuvldoccciw`, block even when the command does not name the ref.
6. For Write/Edit, block `.env`, `.env.*`, and `*.pem` except `.env.example`.
7. Emit block JSON to stdout and exit 0; otherwise emit nothing and exit 0.
8. If input JSON cannot be parsed, fail closed with a block decision explaining that the safety hook input was invalid.

- [ ] **Step 4: Run guard tests until green**

```powershell
node --test scripts/ai/guard-tool-call.test.mjs
```

Expected: PASS for every forbidden/allowed case.

- [ ] **Step 5: Create `.claude/settings.json` with shared hook and secret-read denies**

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "deny": [
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./**/*.pem)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|PowerShell|Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": [
              "${CLAUDE_PROJECT_DIR}/scripts/ai/guard-tool-call.mjs"
            ]
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 6: Validate JSON and Claude settings**

```powershell
node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8')); console.log('settings json ok')"
claude doctor
```

Expected: valid JSON; no Claude settings error caused by the project file.

- [ ] **Step 7: Commit safety guard/settings**

```powershell
git add scripts/ai/guard-tool-call.mjs scripts/ai/guard-tool-call.test.mjs .claude/settings.json
git diff --cached --check
git commit -m "chore: guard AI tool calls"
```

---

## Task 6: Add cheap Git preflight and staged-content gates

**Files:**
- Create: `scripts/ai/preflight.mjs`
- Create: `scripts/ai/staged-gate.mjs`
- Create: `scripts/ai/staged-gate.test.mjs`
- Modify: `package.json`

**Interfaces:**
- `npm run ai:preflight`: reports branch/head/upstream/ahead/behind/status and fails on missing upstream or divergence; dirty worktree itself is not failure.
- `npm run ai:gate:staged`: validates the explicit staged set before commit.

- [ ] **Step 1: Implement `scripts/ai/preflight.mjs`**

Use `execFileSync('git', ...)` only. It must print a compact JSON object with:

```json
{
  "root": "...",
  "branch": "...",
  "head": "...",
  "upstream": "...",
  "ahead": 0,
  "behind": 0,
  "dirtyCount": 0
}
```

Rules:
- fail nonzero if not inside the expected repository;
- fail nonzero if no upstream exists;
- run `git fetch` only when the caller explicitly passes `--fetch`;
- fail nonzero if both ahead > 0 and behind > 0 (diverged);
- do not fail merely because files are modified/untracked;
- do not mutate files/branch.

- [ ] **Step 2: Run actual preflight on the infrastructure branch**

```powershell
node scripts/ai/preflight.mjs --fetch
```

Expected: `chore/ai-agent-workflow`, upstream present, not diverged.

- [ ] **Step 3: Write staged-gate tests before implementation**

Create temporary Git repos under the OS temp directory. Tests must cover:
- ordinary staged `.ts` file passes;
- staged `.env.local` fails;
- staged `pw-report-x/index.html` fails;
- staged `.next/cache/x` fails;
- staged `.claude/settings.local.json` fails;
- staged diff containing `BEGIN PRIVATE KEY` fails;
- staged diff containing `SUPABASE_SERVICE_ROLE_KEY=` fails;
- whitespace error detected by `git diff --cached --check` fails.

- [ ] **Step 4: Run tests and verify RED before implementing the gate**

```powershell
node --test scripts/ai/staged-gate.test.mjs
```

Expected: FAIL due missing gate.

- [ ] **Step 5: Implement `scripts/ai/staged-gate.mjs`**

The script must:
- require at least one staged path;
- run `git diff --cached --check` and fail on nonzero;
- reject staged path patterns: `.env*` except `.env.example`, `.claude/settings.local.json`, `CLAUDE.local.md`, `.next/`, `.next-bloqueada-*`, `playwright-report/`, `test-results/`, `pw-report-*`, `pw-results-*`, `*.pem`;
- inspect only added lines from `git diff --cached --no-ext-diff --unified=0` and reject obvious secret markers: `BEGIN PRIVATE KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `ZAI_API_KEY`, `sb_secret_`;
- print exact staged files plus `STAGED_GATE_PASS` on success;
- never stage/unstage files itself.

- [ ] **Step 6: Run staged-gate tests until green**

```powershell
node --test scripts/ai/staged-gate.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Add package scripts**

Add to `package.json` scripts:

```json
"ai:preflight": "node scripts/ai/preflight.mjs --fetch",
"ai:guard:test": "node --test scripts/ai/guard-tool-call.test.mjs",
"ai:gate:staged": "node scripts/ai/staged-gate.mjs",
"ai:gate:test": "node --test scripts/ai/staged-gate.test.mjs",
"ai:agents:validate": "claude plugin validate .claude/agents"
```

Do not change existing `dev`, `build`, `start`, `lint`, `test`, `test:e2e`, `test:e2e:ui`, or `test:watch` scripts.

- [ ] **Step 8: Run the cheap infrastructure verification set**

```powershell
npm run ai:preflight
npm run ai:guard:test
npm run ai:gate:test
npm run ai:agents:validate
npx tsc --noEmit --pretty false
```

Expected: all PASS.

- [ ] **Step 9: Commit gate scripts/package scripts**

```powershell
git add scripts/ai/preflight.mjs scripts/ai/staged-gate.mjs scripts/ai/staged-gate.test.mjs package.json
git diff --cached --check
git commit -m "chore: add deterministic AI development gates"
```

---

## Task 7: Validate the multi-agent behavior without modifying application code

**Files:**
- No application changes.
- Update only `docs/AI_CHECKPOINT.md` after successful smoke validation.

**Interfaces:**
- Consumes: all repository-owned Claude configuration.
- Produces: evidence that the leader waits for plan approval, cheap explorer works, specialists are discoverable, and safety hooks block forbidden actions.

- [ ] **Step 1: Start a fresh Claude Code session at the infrastructure worktree root**

Reason: the `.claude/agents/` directory did not exist at the original session start; Claude Code documentation requires a fresh session when creating the first agent directory.

- [ ] **Step 2: Confirm memory/settings loaded**

In Claude Code run:

```text
/context
/status
```

Verify:
- project `CLAUDE.md` is listed under memory files;
- project `.claude/settings.json` is listed as a settings source;
- model/provider remains the configured Z.ai GLM setup.

- [ ] **Step 3: Run a read-only orchestration smoke prompt**

Use this exact prompt:

```text
SMOKE TEST ONLY. Do not edit any file and do not run remote Supabase operations.
Pretend I asked for a medium feature: "add a filter by customer to the rental contracts list".
Follow the repository workflow only through the pre-implementation gate: run preflight, use radial-explorer to inspect only the relevant existing files/tests, then present the short product-facing plan you would ask me to approve. Stop before implementation.
```

Expected:
- leader runs preflight;
- uses `radial-explorer` rather than scanning the entire repository itself;
- returns concise plan;
- explicitly waits for approval;
- no files change.

- [ ] **Step 4: Verify agent discovery**

Ask:

```text
List the Radial project subagents available in this repository and their intended role. Do not invoke them.
```

Expected: explorer, implementer, tester, reviewer, database, security.

- [ ] **Step 5: Verify the safety hook with a deliberately forbidden harmless command**

Ask Claude Code to attempt exactly:

```text
For hook testing only, attempt the command `git add .` and do nothing else.
```

Expected: PreToolUse blocks it. Immediately verify `git status --short` is unchanged.

- [ ] **Step 6: Verify MISFY guard without contacting any network**

Ask Claude Code to attempt exactly:

```text
For hook testing only, attempt to prepare/run `npx supabase db push --project-ref misfyiznwnuvldoccciw`. Do not substitute another command.
```

Expected: PreToolUse blocks before execution; there must be no remote call.

- [ ] **Step 7: Update checkpoint with validated workflow state**

Change `docs/AI_CHECKPOINT.md` current workflow section to state that project agents/settings/gates passed local smoke validation and that the infrastructure branch is ready for user workflow test/integration.

- [ ] **Step 8: Commit the checkpoint update**

```powershell
git add docs/AI_CHECKPOINT.md
git diff --cached --check
git commit -m "docs: record AI workflow validation"
```

---

## Task 8: Final independent review and staged/branch verification

**Files:**
- Review all files changed from `origin/codex/controle-locacoes...HEAD`.
- No new file expected unless reviewer identifies an actual defect.

**Interfaces:**
- Consumes: approved spec, this plan, full infrastructure diff, validation evidence.
- Produces: independent APPROVE/REJECT result before user workflow test.

- [ ] **Step 1: Run complete cheap local gates**

```powershell
npm run ai:preflight
npm run ai:guard:test
npm run ai:gate:test
npm run ai:agents:validate
npx tsc --noEmit --pretty false
git diff --check origin/codex/controle-locacoes...HEAD
```

Expected: all PASS.

- [ ] **Step 2: Invoke `radial-reviewer` independently**

Give it:
- the approved spec path;
- this implementation plan path;
- the changed-file list from `git diff --name-status origin/codex/controle-locacoes...HEAD`;
- test/gate results;
- instruction to read only the changed files and whatever surrounding context it truly needs.

Expected: `APPROVE` or actionable `REJECT` findings.

- [ ] **Step 3: If rejected, return findings to `radial-implementer`, then rerun only affected tests plus reviewer**

Do not ask the user unless the finding exposes a new product/business/risk decision.

- [ ] **Step 4: Verify no application/Supabase schema change slipped into this infrastructure branch**

```powershell
git diff --name-only origin/codex/controle-locacoes...HEAD
```

Expected changes are limited to repository AI/docs/config/scripts/package metadata listed by this plan; no `src/`, `e2e/`, or `supabase/migrations/` changes.

- [ ] **Step 5: Push the validated infrastructure branch**

```powershell
git push origin chore/ai-agent-workflow
git fetch origin
git rev-list --left-right --count HEAD...origin/chore/ai-agent-workflow
```

Expected: `0 0`.

- [ ] **Step 6: Report `PRONTO PARA TESTE MANUAL` for the workflow itself**

The report must tell the user to test only these user-facing workflow behaviors in VS Code:
1. ask for a small fictitious feature and verify Claude presents a short plan before editing;
2. do not approve implementation; confirm no file was edited;
3. verify the subagent activity is visible and the chat is usable in the central VS Code tab.

Do not merge/integrate to the stable base until the user says `aprovado` after this workflow test.

---

## Task 9: After user approval, integrate the infrastructure to the stable development base

**Files:**
- No new content expected; integration/checkpoint only.

**Interfaces:**
- Consumes: user `aprovado` after Task 8 manual workflow test.
- Produces: `codex/controle-locacoes` containing the validated AI workflow and synchronized remote state.

- [ ] **Step 1: Confirm explicit user approval exists in the active conversation**

If not, stop. Do not infer approval from earlier design approval; this is approval of the implemented workflow test.

- [ ] **Step 2: Fetch and verify stable base did not advance unexpectedly**

From the isolated infrastructure worktree:

```powershell
git fetch origin
git rev-list --left-right --count origin/codex/controle-locacoes...chore/ai-agent-workflow
```

If stable base has new commits not contained in the infrastructure branch, stop and report rather than rebasing/merging automatically.

- [ ] **Step 3: Fast-forward the stable base only when history is linear**

Use the original worktree only after first confirming its unrelated local changes do not overlap the incoming infrastructure paths. If safe:

```powershell
Set-Location 'C:\tmp\Sistema_Pedidos_Radial-unificar-transformador'
git fetch origin
git merge --ff-only origin/chore/ai-agent-workflow
```

If dirty local files overlap any incoming path, stop; do not stash/reset/restore them.

- [ ] **Step 4: Push the stable branch and verify remote identity**

```powershell
git push origin codex/controle-locacoes
git fetch origin
git rev-list --left-right --count HEAD...origin/codex/controle-locacoes
git rev-parse HEAD
git ls-remote --heads origin refs/heads/codex/controle-locacoes
```

Expected: local/remote `0 0`, same SHA.

- [ ] **Step 5: Final report**

Report:
- stable base SHA;
- infrastructure branch SHA;
- all agent/gate validation results;
- original unrelated local items still preserved;
- IURQ not changed by this infrastructure work;
- MISFY not accessed or altered;
- workflow ready for the first real feature using plan approval → autonomous agents → manual test.

Do not delete the infrastructure worktree/branch in this task; cleanup can be done later after the first real feature proves the workflow stable.

---

## Self-Review Checklist

- Spec coverage: plan implements human approval gates, adaptive subagents, token discipline, deterministic safety/gates, multi-PC Git source of truth, Codex-compatible shared instructions/checkpoint, IURQ/MISFY boundary, and deferred mobile control.
- Existing files respected: `AGENTS.md` and `CLAUDE.md` already exist and are modified rather than recreated; the Next.js agent rule is preserved.
- No placeholders: all paths, agent names, environment refs, commands, and validation criteria are concrete.
- Scope: no application feature, database migration, deploy, IURQ mutation, or MISFY operation is part of this infrastructure implementation.
- Windows: all worktree/orchestration commands are PowerShell-compatible and project hooks use Node for cross-PC portability.
