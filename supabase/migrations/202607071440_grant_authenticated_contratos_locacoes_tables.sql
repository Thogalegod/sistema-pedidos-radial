-- Contract inserts trigger writes to organization_contract_counters, so the helper must run as definer instead of exposing direct table grants.
CREATE OR REPLACE FUNCTION public.set_contract_internal_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  generated_number bigint;
BEGIN
  IF NEW.internal_number IS NULL OR NEW.internal_number = 0 THEN
    INSERT INTO public.organization_contract_counters AS counter (organization_id, next_internal_number)
    VALUES (NEW.organization_id, 2)
    ON CONFLICT (organization_id)
    DO UPDATE SET
      next_internal_number = counter.next_internal_number + 1,
      updated_at = now()
    RETURNING counter.next_internal_number - 1
      INTO generated_number;

    NEW.internal_number := generated_number;
  END IF;

  RETURN NEW;
END;
$function$;

-- RLS does not replace table privileges, so authenticated needs explicit access to the tables used by the current client flows.
GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT ON public.organizations TO authenticated;
GRANT SELECT ON public.organization_members TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_sites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_contacts TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.contracts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_items TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.billing_cycles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_lines TO authenticated;
GRANT SELECT, INSERT ON public.payments TO authenticated;
