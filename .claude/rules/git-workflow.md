# Git workflow

- GitHub is the recoverable source of truth between work PC and home PC.
- Create one isolated `feat/*`, `fix/*`, or `chore/*` branch per unit of work from a synchronized base.
- Before work: fetch, verify upstream and ahead/behind/diverged state. Fast-forward only when safe.
- Never discard unrelated local changes to synchronize.
- Use explicit staging paths only. Never `git add .` or `git add -A`.
- Do not merge/rebase automatically when branch history diverges; report the blocker.
- Writable parallel agents must not edit the same worktree concurrently.
