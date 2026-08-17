-- Lote 3B - Per-item physical asset returns.

ALTER TABLE public.rental_items
  ADD COLUMN IF NOT EXISTS returned_at date;

CREATE INDEX IF NOT EXISTS rental_items_org_asset_returned_idx
  ON public.rental_items (organization_id, asset_id, returned_at)
  WHERE asset_id IS NOT NULL;
