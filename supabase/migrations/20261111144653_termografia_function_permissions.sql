-- IURQ only: match the Termografia function ACLs inspected on MISFY on 2026-11-11.
-- Applied as this exact version through the Supabase connector after transactional QA.
-- No tables, rows, function bodies, storage policies or other modules are changed.
-- Trigger functions are invoked by triggers, not directly by browser clients.
REVOKE EXECUTE ON FUNCTION public.protect_termografia_arquivos_structural_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_termografia_report_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_relatorios_termografia_numbering() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_termografia_pontos_structural_fields() FROM PUBLIC, anon, authenticated;

-- This invoker helper is used by authenticated Storage policies.
REVOKE EXECUTE ON FUNCTION public.is_termografia_storage_orphan_cleanup_object(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_termografia_storage_orphan_cleanup_object(text) TO authenticated;
