-- Period observations remain internal unless explicitly enabled for the invoice.
ALTER TABLE public.billing_cycles
  ADD COLUMN show_note_on_invoice boolean NOT NULL DEFAULT false;

-- Preserve the existing column-level write restriction for authenticated users.
GRANT INSERT (show_note_on_invoice) ON public.billing_cycles TO authenticated;
GRANT UPDATE (show_note_on_invoice) ON public.billing_cycles TO authenticated;

-- Visibility changes alter customer-facing invoice content, like note edits do.
CREATE OR REPLACE FUNCTION private.guard_and_bump_billing_cycle_content_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF OLD.needs_resend = true
     AND NEW.needs_resend = false
     AND current_user IN ('anon', 'authenticated', 'service_role') THEN
    RAISE EXCEPTION 'needs_resend cannot be cleared by API roles' USING ERRCODE = '42501';
  END IF;

  IF OLD.contract_id IS DISTINCT FROM NEW.contract_id
     OR OLD.sequence_number IS DISTINCT FROM NEW.sequence_number
     OR OLD.period_start IS DISTINCT FROM NEW.period_start
     OR OLD.period_end IS DISTINCT FROM NEW.period_end
     OR OLD.issue_date IS DISTINCT FROM NEW.issue_date
     OR OLD.due_date IS DISTINCT FROM NEW.due_date
     OR OLD.base_amount IS DISTINCT FROM NEW.base_amount
     OR OLD.discount_amount IS DISTINCT FROM NEW.discount_amount
     OR OLD.surcharge_amount IS DISTINCT FROM NEW.surcharge_amount
     OR OLD.exemption_amount IS DISTINCT FROM NEW.exemption_amount
     OR OLD.total_amount IS DISTINCT FROM NEW.total_amount
     OR OLD.document_number IS DISTINCT FROM NEW.document_number
     OR OLD.notes IS DISTINCT FROM NEW.notes
     OR OLD.show_note_on_invoice IS DISTINCT FROM NEW.show_note_on_invoice THEN
    NEW.content_revision := OLD.content_revision + 1;
    IF OLD.sent_at IS NOT NULL THEN
      NEW.needs_resend := true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
