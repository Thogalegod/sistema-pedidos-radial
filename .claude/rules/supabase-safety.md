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
