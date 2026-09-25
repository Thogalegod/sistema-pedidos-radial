ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS transport_notes text,
  ADD COLUMN IF NOT EXISTS has_remittance_invoice boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS remittance_invoice_number text,
  ADD COLUMN IF NOT EXISTS remittance_invoice_issuer text,
  ADD COLUMN IF NOT EXISTS remittance_invoice_amount bigint,
  ADD COLUMN IF NOT EXISTS remittance_invoice_issue_date date;
