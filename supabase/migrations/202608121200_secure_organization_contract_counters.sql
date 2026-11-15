ALTER TABLE public.organization_contract_counters
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.organization_contract_counters FROM PUBLIC;
REVOKE ALL ON TABLE public.organization_contract_counters FROM anon;
REVOKE ALL ON TABLE public.organization_contract_counters FROM authenticated;
