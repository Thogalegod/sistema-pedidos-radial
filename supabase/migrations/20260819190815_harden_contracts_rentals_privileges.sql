-- Restrict legacy contracts and rentals privileges to the current authenticated client flows.

REVOKE ALL ON TABLE public.organizations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.organization_members FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.customers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.customer_sites FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.customer_contacts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.contracts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.rental_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.billing_cycles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.billing_lines FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.payments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.contract_documents FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.organizations TO authenticated;
GRANT SELECT ON TABLE public.organization_members TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customer_sites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customer_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.contracts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rental_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.billing_cycles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.billing_lines TO authenticated;
GRANT SELECT, INSERT ON TABLE public.payments TO authenticated;
GRANT SELECT, INSERT ON TABLE public.contract_documents TO authenticated;

-- RLS policies call these membership helpers directly.
REVOKE EXECUTE ON FUNCTION public.is_organization_member(uuid)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_organization_member(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_organization_admin(uuid)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_organization_admin(uuid) TO authenticated;

-- This helper is invoked by its trigger and must not be a directly callable API.
REVOKE EXECUTE ON FUNCTION public.set_contract_internal_number()
FROM PUBLIC, anon, authenticated, service_role;
