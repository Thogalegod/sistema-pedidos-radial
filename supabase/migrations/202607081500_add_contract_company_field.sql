ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS contract_company text NOT NULL DEFAULT 'fontes';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contracts_contract_company_check'
      AND conrelid = 'public.contracts'::regclass
  ) THEN
    ALTER TABLE public.contracts
      ADD CONSTRAINT contracts_contract_company_check
      CHECK (contract_company IN ('fontes', 'radial'));
  END IF;
END $$;
