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
