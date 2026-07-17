-- Core Migration - Contracts and Rentals Module
-- Date: 03/07/2026

-- 1. Create Enums
CREATE TYPE contract_kind AS ENUM ('rental', 'energy_management', 'recurring_service', 'other');
CREATE TYPE contract_status AS ENUM ('draft', 'active', 'paused', 'closing_requested', 'awaiting_return', 'inspection', 'closed', 'cancelled');
CREATE TYPE rental_item_status AS ENUM ('rented', 'returned', 'replaced', 'lost_damaged', 'suspended_exempt');
CREATE TYPE billing_status AS ENUM ('draft', 'issued', 'paid', 'overdue', 'exempt', 'cancelled');
CREATE TYPE inspection_kind AS ENUM ('departure', 'return');
CREATE TYPE sync_state AS ENUM ('local', 'uploading', 'synced', 'failed');

-- 2. Create Core Tables

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Organization Members table (associates Supabase auth users to organizations)
CREATE TABLE IF NOT EXISTS organization_members (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  legal_name text NOT NULL,
  trade_name text NOT NULL,
  tax_id text,
  state_registration text,
  municipal_registration text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_org_id_uidx UNIQUE (organization_id, id)
);

-- Customer Sites (Obras/Locais) table
CREATE TABLE IF NOT EXISTS customer_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  name text NOT NULL,
  address_line text NOT NULL,
  number text NOT NULL,
  complement text,
  district text NOT NULL,
  city text NOT NULL,
  state text NOT NULL CHECK (char_length(state) = 2),
  postal_code text NOT NULL,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_sites_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT customer_sites_customer_org_fkey
    FOREIGN KEY (organization_id, customer_id)
    REFERENCES customers (organization_id, id)
    ON DELETE CASCADE
);

-- Customer Contacts table
CREATE TABLE IF NOT EXISTS customer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  site_id uuid,
  name text NOT NULL,
  job_title text,
  department text,
  phone text,
  whatsapp text,
  email text,
  is_primary boolean NOT NULL DEFAULT false,
  receives_billing boolean NOT NULL DEFAULT false,
  receives_technical boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_contacts_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT customer_contacts_customer_org_fkey
    FOREIGN KEY (organization_id, customer_id)
    REFERENCES customers (organization_id, id)
    ON DELETE CASCADE,
  CONSTRAINT customer_contacts_site_org_fkey
    FOREIGN KEY (organization_id, site_id)
    REFERENCES customer_sites (organization_id, id)
    ON DELETE SET NULL
);

-- Contracts table
CREATE TABLE IF NOT EXISTS contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  internal_number bigint NOT NULL,
  kind contract_kind NOT NULL,
  customer_id uuid NOT NULL,
  site_id uuid NOT NULL,
  legacy_order_number text,
  start_date date NOT NULL,
  end_date date,
  recurrence_days integer NOT NULL DEFAULT 30 CHECK (recurrence_days > 0),
  pricing_model text NOT NULL CHECK (pricing_model IN ('fixed', 'variable', 'percentage', 'fixed_plus_variable')),
  base_amount bigint NOT NULL DEFAULT 0 CHECK (base_amount >= 0), -- stored in cents
  percentage_rate numeric CHECK (percentage_rate >= 0),
  status contract_status NOT NULL DEFAULT 'draft',
  pause_started_at timestamptz,
  pause_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contracts_end_date_chk CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT contracts_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT contracts_customer_org_fkey
    FOREIGN KEY (organization_id, customer_id)
    REFERENCES customers (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT contracts_site_org_fkey
    FOREIGN KEY (organization_id, site_id)
    REFERENCES customer_sites (organization_id, id)
    ON DELETE RESTRICT
);

-- Rental Items table (equipment details on contract)
CREATE TABLE IF NOT EXISTS rental_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL,
  description text NOT NULL,
  equipment_type text NOT NULL,
  capacity text NOT NULL,
  serial_number text NOT NULL,
  internal_code text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_amount bigint NOT NULL DEFAULT 0 CHECK (unit_amount >= 0), -- stored in cents
  status rental_item_status NOT NULL DEFAULT 'rented',
  future_inventory_item_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_items_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT rental_items_contract_org_fkey
    FOREIGN KEY (organization_id, contract_id)
    REFERENCES contracts (organization_id, id)
    ON DELETE CASCADE
);

-- Billing Cycles table (faturamento recorrente)
CREATE TABLE IF NOT EXISTS billing_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL,
  sequence_number integer NOT NULL CHECK (sequence_number >= 1 AND sequence_number <= 999),
  period_start date NOT NULL,
  period_end date NOT NULL,
  issue_date date NOT NULL,
  due_date date NOT NULL,
  base_amount bigint NOT NULL DEFAULT 0 CHECK (base_amount >= 0),
  discount_amount bigint NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  surcharge_amount bigint NOT NULL DEFAULT 0 CHECK (surcharge_amount >= 0),
  exemption_amount bigint NOT NULL DEFAULT 0 CHECK (exemption_amount >= 0),
  total_amount bigint NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  document_type text NOT NULL CHECK (document_type IN ('receipt', 'nfe', 'legacy', 'other')),
  document_number text,
  status billing_status NOT NULL DEFAULT 'draft',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_cycles_period_chk CHECK (period_end >= period_start),
  CONSTRAINT billing_cycles_due_chk CHECK (due_date >= issue_date),
  CONSTRAINT billing_cycles_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT billing_cycles_contract_org_fkey
    FOREIGN KEY (organization_id, contract_id)
    REFERENCES contracts (organization_id, id)
    ON DELETE RESTRICT
);

-- Billing Lines table (items included in billing cycle)
CREATE TABLE IF NOT EXISTS billing_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  billing_cycle_id uuid NOT NULL,
  rental_item_id uuid,
  description text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_amount bigint NOT NULL CHECK (unit_amount >= 0),
  total_amount bigint NOT NULL CHECK (total_amount >= 0),
  kind text NOT NULL CHECK (kind IN ('recurring', 'damage', 'discount', 'surcharge')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_lines_billing_cycle_org_fkey
    FOREIGN KEY (organization_id, billing_cycle_id)
    REFERENCES billing_cycles (organization_id, id)
    ON DELETE CASCADE,
  CONSTRAINT billing_lines_rental_item_org_fkey
    FOREIGN KEY (organization_id, rental_item_id)
    REFERENCES rental_items (organization_id, id)
    ON DELETE SET NULL
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  billing_cycle_id uuid NOT NULL,
  paid_at timestamptz NOT NULL,
  amount bigint NOT NULL CHECK (amount >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_billing_cycle_org_fkey
    FOREIGN KEY (organization_id, billing_cycle_id)
    REFERENCES billing_cycles (organization_id, id)
    ON DELETE RESTRICT
);

-- Inspections table (vistoria de entrada e saída)
CREATE TABLE IF NOT EXISTS inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL,
  rental_item_id uuid NOT NULL,
  kind inspection_kind NOT NULL,
  inspected_at timestamptz NOT NULL DEFAULT now(),
  responsible_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  condition_notes text,
  accessories text[],
  existing_damage text,
  return_damage text,
  missing_accessories text[],
  estimated_cost bigint CHECK (estimated_cost >= 0), -- stored in cents
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inspections_org_id_uidx UNIQUE (organization_id, id),
  CONSTRAINT inspections_contract_org_fkey
    FOREIGN KEY (organization_id, contract_id)
    REFERENCES contracts (organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT inspections_rental_item_org_fkey
    FOREIGN KEY (organization_id, rental_item_id)
    REFERENCES rental_items (organization_id, id)
    ON DELETE RESTRICT
);

-- Inspection Photos table
CREATE TABLE IF NOT EXISTS inspection_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  inspection_id uuid NOT NULL,
  client_idempotency_key text NOT NULL,
  storage_path text NOT NULL,
  thumbnail_path text,
  sync_state sync_state NOT NULL DEFAULT 'local',
  caption text,
  taken_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inspection_photos_inspection_org_fkey
    FOREIGN KEY (organization_id, inspection_id)
    REFERENCES inspections (organization_id, id)
    ON DELETE CASCADE
);

-- Signatures table
CREATE TABLE IF NOT EXISTS signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  inspection_id uuid NOT NULL,
  client_idempotency_key text NOT NULL,
  storage_path text NOT NULL,
  signer_name text NOT NULL,
  signer_document text NOT NULL,
  signed_at timestamptz NOT NULL,
  sync_state sync_state NOT NULL DEFAULT 'local',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signatures_inspection_org_fkey
    FOREIGN KEY (organization_id, inspection_id)
    REFERENCES inspections (organization_id, id)
    ON DELETE CASCADE
);

-- Contract Documents table (anexos)
CREATE TABLE IF NOT EXISTS contract_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL,
  billing_cycle_id uuid,
  inspection_id uuid,
  kind text NOT NULL CHECK (kind IN ('order', 'shipping', 'contract', 'receipt_nf', 'payment_proof', 'other')),
  storage_path text NOT NULL,
  file_name text NOT NULL,
  content_type text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contract_documents_contract_org_fkey
    FOREIGN KEY (organization_id, contract_id)
    REFERENCES contracts (organization_id, id)
    ON DELETE CASCADE,
  CONSTRAINT contract_documents_billing_cycle_org_fkey
    FOREIGN KEY (organization_id, billing_cycle_id)
    REFERENCES billing_cycles (organization_id, id)
    ON DELETE SET NULL,
  CONSTRAINT contract_documents_inspection_org_fkey
    FOREIGN KEY (organization_id, inspection_id)
    REFERENCES inspections (organization_id, id)
    ON DELETE SET NULL
);

-- Audit Events table
CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Import Batches table
CREATE TABLE IF NOT EXISTS import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  checksum text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
  summary jsonb,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Import Rows table
CREATE TABLE IF NOT EXISTS import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  source_file text NOT NULL,
  source_sheet text NOT NULL,
  source_row integer NOT NULL,
  entity_type text NOT NULL,
  source_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('imported', 'skipped', 'failed')),
  errors jsonb,
  imported_entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);


-- 3. Create Constraints & Indexes

-- Unique CNPJ/CPF per organization (normalizing by removing non-digits)
CREATE UNIQUE INDEX IF NOT EXISTS customers_org_tax_id_uidx
  ON customers (organization_id, regexp_replace(coalesce(tax_id, ''), '\D', '', 'g'))
  WHERE tax_id IS NOT NULL AND tax_id <> '';

-- Unique active document number per organization
CREATE UNIQUE INDEX IF NOT EXISTS billing_document_org_uidx
  ON billing_cycles (organization_id, document_number)
  WHERE document_number IS NOT NULL AND status <> 'cancelled';

CREATE UNIQUE INDEX IF NOT EXISTS contracts_org_internal_number_uidx
  ON contracts (organization_id, internal_number);

-- Unique sequence number of faturamento per contract
CREATE UNIQUE INDEX IF NOT EXISTS billing_contract_sequence_uidx
  ON billing_cycles (contract_id, sequence_number);

-- Idempotency indexes for photos, signatures and import checksums
CREATE UNIQUE INDEX IF NOT EXISTS inspection_photos_org_idempotency_uidx
  ON inspection_photos (organization_id, client_idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS signatures_org_idempotency_uidx
  ON signatures (organization_id, client_idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS import_batches_org_checksum_uidx
  ON import_batches (organization_id, checksum);

-- Query optimization indexes
CREATE INDEX IF NOT EXISTS billing_due_status_idx ON billing_cycles (organization_id, status, due_date);
CREATE INDEX IF NOT EXISTS contracts_customer_status_idx ON contracts (organization_id, customer_id, status);
CREATE INDEX IF NOT EXISTS customer_sites_customer_idx ON customer_sites (organization_id, customer_id);
CREATE INDEX IF NOT EXISTS customer_contacts_customer_idx ON customer_contacts (organization_id, customer_id);
CREATE INDEX IF NOT EXISTS rental_items_contract_idx ON rental_items (organization_id, contract_id);


-- 4. Triggers for Automatic updated_at and Sequential Numbering

-- Trigger function for updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER set_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_customer_sites_updated_at BEFORE UPDATE ON customer_sites FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_customer_contacts_updated_at BEFORE UPDATE ON customer_contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_contracts_updated_at BEFORE UPDATE ON contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_rental_items_updated_at BEFORE UPDATE ON rental_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_billing_cycles_updated_at BEFORE UPDATE ON billing_cycles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_billing_lines_updated_at BEFORE UPDATE ON billing_lines FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_inspections_updated_at BEFORE UPDATE ON inspections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_inspection_photos_updated_at BEFORE UPDATE ON inspection_photos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_signatures_updated_at BEFORE UPDATE ON signatures FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger function to automatically generate internal_number sequentially per organization
CREATE TABLE IF NOT EXISTS organization_contract_counters (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  next_internal_number bigint NOT NULL CHECK (next_internal_number >= 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_contract_internal_number()
RETURNS TRIGGER AS $$
DECLARE
  generated_number bigint;
BEGIN
  IF NEW.internal_number IS NULL OR NEW.internal_number = 0 THEN
    INSERT INTO organization_contract_counters AS counter (organization_id, next_internal_number)
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_contract_internal_number_trig
  BEFORE INSERT ON contracts
  FOR EACH ROW
  EXECUTE FUNCTION set_contract_internal_number();


-- 5. Row Level Security (RLS) Configuration

-- Helper function to check if authenticated user belongs to organization
CREATE OR REPLACE FUNCTION is_organization_member(target_org uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_members AS membership
    WHERE membership.organization_id = target_org
      AND membership.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION is_organization_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_organization_member(uuid) TO authenticated;

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_rows ENABLE ROW LEVEL SECURITY;

-- 6. Define Policies

-- Organizations Policies
CREATE POLICY "Users can select organizations they belong to" ON organizations
  FOR SELECT USING (is_organization_member(id));

-- Organization Members Policies
CREATE POLICY "Users can select membership details within their organizations" ON organization_members
  FOR SELECT USING (is_organization_member(organization_id));

CREATE POLICY "Admins can manage organization members" ON organization_members
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM organization_members AS acting_member
      WHERE acting_member.organization_id = organization_members.organization_id
        AND acting_member.user_id = auth.uid()
        AND acting_member.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM organization_members AS acting_member
      WHERE acting_member.organization_id = organization_members.organization_id
        AND acting_member.user_id = auth.uid()
        AND acting_member.role = 'admin'
    )
  );

-- Helper macro for organization-scoped tables (SELECT, INSERT, UPDATE)
-- Denial of DELETE is default (since no DELETE policy is declared, all DELETEs fail for non-superusers).

-- Customers
CREATE POLICY "Customers SELECT policy" ON customers FOR SELECT USING (is_organization_member(organization_id));
CREATE POLICY "Customers INSERT policy" ON customers FOR INSERT WITH CHECK (is_organization_member(organization_id));
CREATE POLICY "Customers UPDATE policy" ON customers FOR UPDATE USING (is_organization_member(organization_id)) WITH CHECK (is_organization_member(organization_id));

-- Customer Sites
CREATE POLICY "Customer Sites SELECT policy" ON customer_sites FOR SELECT USING (is_organization_member(organization_id));
CREATE POLICY "Customer Sites INSERT policy" ON customer_sites FOR INSERT WITH CHECK (is_organization_member(organization_id));
CREATE POLICY "Customer Sites UPDATE policy" ON customer_sites FOR UPDATE USING (is_organization_member(organization_id)) WITH CHECK (is_organization_member(organization_id));
CREATE POLICY "Customer Sites DELETE policy" ON customer_sites FOR DELETE USING (is_organization_member(organization_id));

-- Customer Contacts
CREATE POLICY "Customer Contacts SELECT policy" ON customer_contacts FOR SELECT USING (is_organization_member(organization_id));
CREATE POLICY "Customer Contacts INSERT policy" ON customer_contacts FOR INSERT WITH CHECK (is_organization_member(organization_id));
CREATE POLICY "Customer Contacts UPDATE policy" ON customer_contacts FOR UPDATE USING (is_organization_member(organization_id)) WITH CHECK (is_organization_member(organization_id));
CREATE POLICY "Customer Contacts DELETE policy" ON customer_contacts FOR DELETE USING (is_organization_member(organization_id));

-- Contracts
CREATE POLICY "Contracts SELECT policy" ON contracts FOR SELECT USING (is_organization_member(organization_id));
CREATE POLICY "Contracts INSERT policy" ON contracts FOR INSERT WITH CHECK (is_organization_member(organization_id));
CREATE POLICY "Contracts UPDATE policy" ON contracts FOR UPDATE USING (is_organization_member(organization_id)) WITH CHECK (is_organization_member(organization_id));

-- Rental Items
CREATE POLICY "Rental Items SELECT policy" ON rental_items FOR SELECT USING (is_organization_member(organization_id));
CREATE POLICY "Rental Items INSERT policy" ON rental_items FOR INSERT WITH CHECK (is_organization_member(organization_id));
CREATE POLICY "Rental Items UPDATE policy" ON rental_items FOR UPDATE USING (is_organization_member(organization_id)) WITH CHECK (is_organization_member(organization_id));
CREATE POLICY "Rental Items DELETE policy" ON rental_items FOR DELETE USING (is_organization_member(organization_id));

-- Billing Cycles
CREATE POLICY "Billing Cycles SELECT policy" ON billing_cycles FOR SELECT USING (is_organization_member(organization_id));
CREATE POLICY "Billing Cycles INSERT policy" ON billing_cycles FOR INSERT WITH CHECK (is_organization_member(organization_id));
CREATE POLICY "Billing Cycles UPDATE policy" ON billing_cycles FOR UPDATE USING (is_organization_member(organization_id)) WITH CHECK (is_organization_member(organization_id));

-- Billing Lines
CREATE POLICY "Billing Lines SELECT policy" ON billing_lines FOR SELECT USING (is_organization_member(organization_id));
CREATE POLICY "Billing Lines INSERT policy" ON billing_lines FOR INSERT WITH CHECK (is_organization_member(organization_id));
CREATE POLICY "Billing Lines UPDATE policy" ON billing_lines FOR UPDATE USING (is_organization_member(organization_id)) WITH CHECK (is_organization_member(organization_id));
CREATE POLICY "Billing Lines DELETE policy" ON billing_lines FOR DELETE USING (is_organization_member(organization_id));

-- Payments
CREATE POLICY "Payments SELECT policy" ON payments FOR SELECT USING (is_organization_member(organization_id));
CREATE POLICY "Payments INSERT policy" ON payments FOR INSERT WITH CHECK (is_organization_member(organization_id));
CREATE POLICY "Payments UPDATE policy" ON payments FOR UPDATE USING (is_organization_member(organization_id)) WITH CHECK (is_organization_member(organization_id));

-- Inspections
CREATE POLICY "Inspections SELECT policy" ON inspections FOR SELECT USING (is_organization_member(organization_id));
CREATE POLICY "Inspections INSERT policy" ON inspections FOR INSERT WITH CHECK (is_organization_member(organization_id));
CREATE POLICY "Inspections UPDATE policy" ON inspections FOR UPDATE USING (is_organization_member(organization_id)) WITH CHECK (is_organization_member(organization_id));

-- Inspection Photos
CREATE POLICY "Inspection Photos SELECT policy" ON inspection_photos FOR SELECT USING (is_organization_member(organization_id));
CREATE POLICY "Inspection Photos INSERT policy" ON inspection_photos FOR INSERT WITH CHECK (is_organization_member(organization_id));
CREATE POLICY "Inspection Photos UPDATE policy" ON inspection_photos FOR UPDATE USING (is_organization_member(organization_id)) WITH CHECK (is_organization_member(organization_id));
CREATE POLICY "Inspection Photos DELETE policy" ON inspection_photos FOR DELETE USING (is_organization_member(organization_id));

-- Signatures
CREATE POLICY "Signatures SELECT policy" ON signatures FOR SELECT USING (is_organization_member(organization_id));
CREATE POLICY "Signatures INSERT policy" ON signatures FOR INSERT WITH CHECK (is_organization_member(organization_id));
CREATE POLICY "Signatures UPDATE policy" ON signatures FOR UPDATE USING (is_organization_member(organization_id)) WITH CHECK (is_organization_member(organization_id));
CREATE POLICY "Signatures DELETE policy" ON signatures FOR DELETE USING (is_organization_member(organization_id));

-- Contract Documents
CREATE POLICY "Contract Documents SELECT policy" ON contract_documents FOR SELECT USING (is_organization_member(organization_id));
CREATE POLICY "Contract Documents INSERT policy" ON contract_documents FOR INSERT WITH CHECK (is_organization_member(organization_id));
CREATE POLICY "Contract Documents UPDATE policy" ON contract_documents FOR UPDATE USING (is_organization_member(organization_id)) WITH CHECK (is_organization_member(organization_id));

-- Audit Events
CREATE POLICY "Audit Events SELECT policy" ON audit_events FOR SELECT USING (is_organization_member(organization_id));
-- Audit events must be created by trusted server-side code (RPCs or triggers), not directly by clients.

-- Import Batches
CREATE POLICY "Import Batches SELECT policy" ON import_batches FOR SELECT USING (is_organization_member(organization_id));
CREATE POLICY "Import Batches INSERT policy" ON import_batches FOR INSERT WITH CHECK (is_organization_member(organization_id));
CREATE POLICY "Import Batches UPDATE policy" ON import_batches FOR UPDATE USING (is_organization_member(organization_id)) WITH CHECK (is_organization_member(organization_id));

-- Import Rows (Note: rows references batch, which has organization_id, but to support fast RLS queries we enforce RLS through the batch relationship)
CREATE POLICY "Import Rows SELECT policy" ON import_rows FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM import_batches
    WHERE import_batches.id = import_rows.batch_id
      AND is_organization_member(import_batches.organization_id)
  )
);
CREATE POLICY "Import Rows INSERT policy" ON import_rows FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM import_batches
    WHERE import_batches.id = import_rows.batch_id
      AND is_organization_member(import_batches.organization_id)
  )
);
CREATE POLICY "Import Rows UPDATE policy" ON import_rows FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM import_batches
    WHERE import_batches.id = import_rows.batch_id
      AND is_organization_member(import_batches.organization_id)
  )
);


-- 7. Seed Initial Organization (Radial Energia)
-- Note: User UUID association will happen on auth setup or during local tests.

INSERT INTO organizations (name, slug)
VALUES ('Radial Energia', 'radial')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;
