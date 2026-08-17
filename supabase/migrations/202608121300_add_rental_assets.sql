-- Lote 3A - Physical rental assets and derived availability
-- Local migration only. Do not apply to IURQ or MISFY from this task.

CREATE TABLE IF NOT EXISTS public.rental_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  description text NOT NULL,
  equipment_type text,
  capacity text,
  serial_number text,
  internal_code text,
  operational_status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_assets_status_chk
    CHECK (operational_status IN ('active', 'maintenance', 'inactive', 'retired')),
  CONSTRAINT rental_assets_org_id_uidx UNIQUE (organization_id, id)
);

CREATE INDEX IF NOT EXISTS rental_assets_org_status_idx
  ON public.rental_assets (organization_id, operational_status, description);

CREATE UNIQUE INDEX IF NOT EXISTS rental_assets_org_internal_code_uidx
  ON public.rental_assets (organization_id, internal_code)
  WHERE internal_code IS NOT NULL AND internal_code <> '';

CREATE UNIQUE INDEX IF NOT EXISTS rental_assets_org_serial_number_uidx
  ON public.rental_assets (organization_id, serial_number)
  WHERE serial_number IS NOT NULL AND serial_number <> '';

ALTER TABLE public.rental_items
  ADD COLUMN IF NOT EXISTS asset_id uuid;

CREATE INDEX IF NOT EXISTS rental_items_org_asset_idx
  ON public.rental_items (organization_id, asset_id)
  WHERE asset_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rental_items_asset_org_fkey'
      AND conrelid = 'public.rental_items'::regclass
  ) THEN
    ALTER TABLE public.rental_items
      ADD CONSTRAINT rental_items_asset_org_fkey
      FOREIGN KEY (organization_id, asset_id)
      REFERENCES public.rental_assets (organization_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rental_items_asset_quantity_chk'
      AND conrelid = 'public.rental_items'::regclass
  ) THEN
    ALTER TABLE public.rental_items
      ADD CONSTRAINT rental_items_asset_quantity_chk
      CHECK (asset_id IS NULL OR quantity = 1);
  END IF;
END $$;

DROP TRIGGER IF EXISTS set_rental_assets_updated_at ON public.rental_assets;
CREATE TRIGGER set_rental_assets_updated_at
  BEFORE UPDATE ON public.rental_assets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.rental_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Rental Assets SELECT policy" ON public.rental_assets;
DROP POLICY IF EXISTS "Rental Assets INSERT policy" ON public.rental_assets;
DROP POLICY IF EXISTS "Rental Assets UPDATE policy" ON public.rental_assets;

CREATE POLICY "Rental Assets SELECT policy" ON public.rental_assets
  FOR SELECT
  TO authenticated
  USING (public.is_organization_member(organization_id));

CREATE POLICY "Rental Assets INSERT policy" ON public.rental_assets
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_organization_member(organization_id));

CREATE POLICY "Rental Assets UPDATE policy" ON public.rental_assets
  FOR UPDATE
  TO authenticated
  USING (public.is_organization_member(organization_id))
  WITH CHECK (public.is_organization_member(organization_id));

REVOKE ALL ON public.rental_assets FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.rental_assets TO authenticated;
