-- CLI entry point: supabase test db --local supabase/tests/pedidos_v1_baseline_privileges.test.sql
-- The CLI mounts the selected file's parent. Selecting this wrapper includes
-- both database/ and helpers/; selecting only database/ hides sibling helpers.
\ir database/pedidos_v1_baseline_privileges.test.sql
