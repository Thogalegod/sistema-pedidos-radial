import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = path.resolve(
  __dirname,
  '../../../supabase/migrations'
);
const baseMigrationPath = path.join(
  migrationsDir,
  '202607030001_contracts_rentals_core.sql'
);
const baseSql = readFileSync(baseMigrationPath, 'utf8');

function readOrganizationMembersFixMigration() {
  const matches = readdirSync(migrationsDir).filter((filename) =>
    /_fix_organization_members_rls_recursion\.sql$/i.test(filename)
  );

  expect(matches, 'expected exactly one organization_members RLS fix migration').toHaveLength(1);

  return readFileSync(path.join(migrationsDir, matches[0]), 'utf8');
}

function readAuthenticatedGrantsMigration() {
  const matches = readdirSync(migrationsDir).filter((filename) =>
    /_grant_authenticated_contratos_locacoes_tables\.sql$/i.test(filename)
  );

  expect(matches, 'expected exactly one authenticated grants migration').toHaveLength(1);

  return readFileSync(path.join(migrationsDir, matches[0]), 'utf8');
}

function readRemittanceFieldsMigration() {
  const matches = readdirSync(migrationsDir).filter((filename) =>
    /_add_contract_remittance_fields\.sql$/i.test(filename)
  );

  expect(matches, 'expected exactly one remittance fields migration').toHaveLength(1);

  return readFileSync(path.join(migrationsDir, matches[0]), 'utf8');
}

function readCompanyFieldMigration() {
  const matches = readdirSync(migrationsDir).filter((filename) =>
    /_add_contract_company_field\.sql$/i.test(filename)
  );

  expect(matches, 'expected exactly one contract company migration').toHaveLength(1);

  return readFileSync(path.join(migrationsDir, matches[0]), 'utf8');
}

function readRemittanceDocumentMigration() {
  const matches = readdirSync(migrationsDir).filter((filename) =>
    /_add_contract_remittance_document_support\.sql$/i.test(filename)
  );

  expect(matches, 'expected exactly one remittance document support migration').toHaveLength(1);

  return readFileSync(path.join(migrationsDir, matches[0]), 'utf8');
}

function readBillingSentAtAndPaymentProofsMigration() {
  const matches = readdirSync(migrationsDir).filter((filename) =>
    /_add_billing_sent_at_and_payment_proofs\.sql$/i.test(filename)
  );

  expect(matches, 'expected exactly one billing sent_at and payment proofs migration').toHaveLength(1);

  return readFileSync(path.join(migrationsDir, matches[0]), 'utf8');
}

function readRentalAssetsMigration() {
  const matches = readdirSync(migrationsDir).filter((filename) =>
    /_add_rental_assets\.sql$/i.test(filename)
  );

  expect(matches, 'expected exactly one rental assets migration').toHaveLength(1);

  return readFileSync(path.join(migrationsDir, matches[0]), 'utf8');
}

function readRentalReturnsMigration() {
  const matches = readdirSync(migrationsDir).filter((filename) =>
    /_add_rental_item_returns\.sql$/i.test(filename)
  );

  expect(matches, 'expected exactly one rental item returns migration').toHaveLength(1);

  return readFileSync(path.join(migrationsDir, matches[0]), 'utf8');
}

function readRentalAssetBookingProtectionMigration() {
  const matches = readdirSync(migrationsDir).filter((filename) =>
    /_protect_rental_asset_bookings\.sql$/i.test(filename)
  );

  expect(matches, 'expected exactly one rental asset booking protection migration').toHaveLength(1);

  return readFileSync(path.join(migrationsDir, matches[0]), 'utf8');
}

function readRentalBookingFunctionExecuteRestrictionMigration() {
  const matches = readdirSync(migrationsDir).filter((filename) =>
    /_restrict_rental_booking_function_execute\.sql$/i.test(filename)
  );

  expect(matches, 'expected exactly one rental booking function execute restriction migration').toHaveLength(1);

  return readFileSync(path.join(migrationsDir, matches[0]), 'utf8');
}

function readContractsRentalsPrivilegeHardeningMigration() {
  const matches = readdirSync(migrationsDir).filter((filename) =>
    /_harden_contracts_rentals_privileges\.sql$/i.test(filename)
  );

  expect(matches, 'expected exactly one contracts and rentals privilege hardening migration').toHaveLength(1);

  return readFileSync(path.join(migrationsDir, matches[0]), 'utf8');
}

describe('contracts and rentals migration consistency', () => {
  it('protects internal contract numbering against duplicate generation', () => {
    expect(baseSql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS contracts_org_internal_number_uidx/i);
    expect(baseSql).not.toMatch(/SELECT max\(internal_number\) FROM contracts/i);
  });

  it('keeps is_organization_member hardened as a security definer helper', () => {
    const fixSql = readOrganizationMembersFixMigration();

    expect(fixSql).toMatch(/CREATE OR REPLACE FUNCTION public\.is_organization_member\(target_org uuid\)/i);
    expect(fixSql).toMatch(/SECURITY DEFINER/i);
    expect(fixSql).toMatch(/SET search_path = public/i);
    expect(fixSql).toMatch(/FROM public\.organization_members AS membership/i);
    expect(fixSql).toMatch(/REVOKE ALL ON FUNCTION public\.is_organization_member\(uuid\) FROM PUBLIC/i);
    expect(fixSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.is_organization_member\(uuid\) TO authenticated/i);
  });

  it('replaces the recursive organization_members admin policy with explicit helper-based policies', () => {
    const fixSql = readOrganizationMembersFixMigration();

    expect(fixSql).toMatch(/CREATE OR REPLACE FUNCTION public\.is_organization_admin\(target_org uuid\)/i);
    expect(fixSql).toMatch(/SECURITY DEFINER/i);
    expect(fixSql).toMatch(/SET search_path = public/i);
    expect(fixSql).toMatch(/FROM public\.organization_members AS membership/i);
    expect(fixSql).toMatch(/REVOKE ALL ON FUNCTION public\.is_organization_admin\(uuid\) FROM PUBLIC/i);
    expect(fixSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.is_organization_admin\(uuid\) TO authenticated/i);

    expect(fixSql).toMatch(/DROP POLICY IF EXISTS "Users can select membership details within their organizations" ON public\.organization_members/i);
    expect(fixSql).toMatch(/DROP POLICY IF EXISTS "Admins can manage organization members" ON public\.organization_members/i);
    expect(fixSql).not.toMatch(/CREATE POLICY "Admins can manage organization members"[\s\S]*FOR ALL/i);
    expect(fixSql).toMatch(/CREATE POLICY "Users can select own organization memberships"/i);
    expect(fixSql).toMatch(/CREATE POLICY "Admins can select organization memberships"/i);
    expect(fixSql).toMatch(/CREATE POLICY "Admins can insert organization memberships"/i);
    expect(fixSql).toMatch(/CREATE POLICY "Admins can update organization memberships"/i);
  });

  it('adds a conservative authenticated grants migration for the current app tables', () => {
    const grantSql = readAuthenticatedGrantsMigration();

    expect(grantSql).toMatch(/GRANT USAGE ON SCHEMA public TO authenticated/i);

    expect(grantSql).toMatch(/GRANT SELECT ON public\.organizations TO authenticated/i);
    expect(grantSql).toMatch(/GRANT SELECT ON public\.organization_members TO authenticated/i);

    expect(grantSql).toMatch(/GRANT SELECT, INSERT, UPDATE ON public\.customers TO authenticated/i);
    expect(grantSql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON public\.customer_sites TO authenticated/i);
    expect(grantSql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON public\.customer_contacts TO authenticated/i);
    expect(grantSql).toMatch(/GRANT SELECT, INSERT, UPDATE ON public\.contracts TO authenticated/i);
    expect(grantSql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON public\.rental_items TO authenticated/i);
    expect(grantSql).toMatch(/GRANT SELECT, INSERT, UPDATE ON public\.billing_cycles TO authenticated/i);
    expect(grantSql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON public\.billing_lines TO authenticated/i);
    expect(grantSql).toMatch(/GRANT SELECT, INSERT ON public\.payments TO authenticated/i);

    expect(grantSql).not.toMatch(/\bGRANT\b[\s\S]*\bTO anon\b/i);
    expect(grantSql).not.toMatch(/GRANT [^;]* ON public\.audit_events TO authenticated/i);
    expect(grantSql).not.toMatch(/GRANT [^;]* ON public\.organization_contract_counters TO authenticated/i);
    expect(grantSql).not.toMatch(/GRANT [^;]* ON public\.import_batches TO authenticated/i);
    expect(grantSql).not.toMatch(/GRANT [^;]* ON public\.import_rows TO authenticated/i);
    expect(grantSql).not.toMatch(/GRANT [^;]* ON public\.inspections TO authenticated/i);
    expect(grantSql).not.toMatch(/GRANT [^;]* ON public\.inspection_photos TO authenticated/i);
    expect(grantSql).not.toMatch(/GRANT [^;]* ON public\.signatures TO authenticated/i);
    expect(grantSql).not.toMatch(/GRANT [^;]* ON public\.contract_documents TO authenticated/i);
  });

  it('hardens contract numbering trigger helper instead of granting direct access to counters', () => {
    const grantSql = readAuthenticatedGrantsMigration();

    expect(grantSql).toMatch(/CREATE OR REPLACE FUNCTION public\.set_contract_internal_number\(\)/i);
    expect(grantSql).toMatch(/SECURITY DEFINER/i);
    expect(grantSql).toMatch(/SET search_path = public/i);
    expect(grantSql).toMatch(/INSERT INTO public\.organization_contract_counters AS counter/i);
    expect(grantSql).not.toMatch(/GRANT [^;]* ON public\.organization_contract_counters TO authenticated/i);
  });

  it('hardens contracts and rentals table and function privileges to the minimum required access', () => {
    const sql = readContractsRentalsPrivilegeHardeningMigration();
    const tableGrants = [
      ['organizations', 'SELECT'],
      ['organization_members', 'SELECT'],
      ['customers', 'SELECT, INSERT, UPDATE'],
      ['customer_sites', 'SELECT, INSERT, UPDATE, DELETE'],
      ['customer_contacts', 'SELECT, INSERT, UPDATE, DELETE'],
      ['contracts', 'SELECT, INSERT, UPDATE'],
      ['rental_items', 'SELECT, INSERT, UPDATE, DELETE'],
      ['billing_cycles', 'SELECT, INSERT, UPDATE'],
      ['billing_lines', 'SELECT, INSERT, UPDATE, DELETE'],
      ['payments', 'SELECT, INSERT'],
      ['contract_documents', 'SELECT, INSERT'],
    ] as const;

    for (const [table, privileges] of tableGrants) {
      expect(sql).toMatch(
        new RegExp(
          `REVOKE ALL ON TABLE public\\.${table} FROM PUBLIC,\\s*anon,\\s*authenticated`,
          'i'
        )
      );
      expect(sql).toMatch(
        new RegExp(
          `GRANT ${privileges} ON TABLE public\\.${table} TO authenticated`,
          'i'
        )
      );
    }

    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.is_organization_member\(uuid\)\s+FROM PUBLIC,\s*anon,\s*service_role/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.is_organization_member\(uuid\) TO authenticated/i);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.is_organization_admin\(uuid\)\s+FROM PUBLIC,\s*anon,\s*service_role/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.is_organization_admin\(uuid\) TO authenticated/i);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.set_contract_internal_number\(\)\s+FROM PUBLIC,\s*anon,\s*authenticated,\s*service_role/i);

    expect(sql).not.toMatch(/GRANT [^;]* TO anon/i);
    expect(sql).not.toMatch(/GRANT [^;]* ON TABLE public\.rental_assets/i);
    expect(sql).not.toMatch(/GRANT [^;]* ON TABLE public\.organization_contract_counters/i);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.set_contract_internal_number\(\)/i);
    expect(sql).not.toMatch(/ALTER DEFAULT PRIVILEGES/i);
  });

  it('prevents direct client inserts into audit_events', () => {
    expect(baseSql).not.toMatch(/CREATE POLICY "Audit Events INSERT policy"/i);
  });

  it('enforces organization-scoped foreign keys on customer and contract relations', () => {
    expect(baseSql).toMatch(/FOREIGN KEY \(organization_id, customer_id\)\s+REFERENCES customers \(organization_id, id\)/i);
    expect(baseSql).toMatch(/FOREIGN KEY \(organization_id, site_id\)\s+REFERENCES customer_sites \(organization_id, id\)/i);
    expect(baseSql).toMatch(/FOREIGN KEY \(organization_id, contract_id\)\s+REFERENCES contracts \(organization_id, id\)/i);
  });

  it('adds transport and remittance invoice fields through a dedicated contracts migration', () => {
    const sql = readRemittanceFieldsMigration();

    expect(sql).toMatch(/ALTER TABLE public\.contracts/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS transport_notes text/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS has_remittance_invoice boolean NOT NULL DEFAULT false/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS remittance_invoice_number text/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS remittance_invoice_issuer text/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS remittance_invoice_amount bigint/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS remittance_invoice_issue_date date/i);
  });

  it('adds the contract company field with a restricted check constraint', () => {
    const sql = readCompanyFieldMigration();

    expect(sql).toMatch(/ALTER TABLE public\.contracts/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS contract_company text NOT NULL DEFAULT 'fontes'/i);
    expect(sql).toMatch(/CHECK \(contract_company IN \('fontes', 'radial'\)\)/i);
  });

  it('adds remittance NF document support with private storage and constrained metadata', () => {
    const sql = readRemittanceDocumentMigration();

    expect(sql).toMatch(/ALTER TABLE public\.contract_documents/i);
    expect(sql).toMatch(/kind IN \('order', 'shipping', 'contract', 'receipt_nf', 'payment_proof', 'remittance_nf', 'other'\)/i);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS contract_documents_one_remittance_nf_per_contract_uidx/i);
    expect(sql).toMatch(/GRANT SELECT, INSERT ON public\.contract_documents TO authenticated/i);
    expect(sql).toMatch(/INSERT INTO storage\.buckets/i);
    expect(sql).toMatch(/'contratos-locacoes-docs'/i);
    expect(sql).toMatch(/file_size_limit/i);
    expect(sql).toMatch(/10485760/i);
    expect(sql).toMatch(/CREATE POLICY "Contract documents storage read by organization members"/i);
    expect(sql).toMatch(/CREATE POLICY "Contract documents storage insert by organization members"/i);
    expect(sql).toMatch(/storage\.objects/i);
    expect(sql).toMatch(/organization_members/i);
    expect(sql).toMatch(/bucket_id = 'contratos-locacoes-docs'/i);
    expect(sql.match(/array_length\(storage\.foldername\(name\), 1\) = 3/gi)).toHaveLength(3);
    expect(sql).not.toMatch(/array_length\(storage\.foldername\(name\), 1\) >= 3/i);
    expect(sql).toMatch(/\(storage\.foldername\(name\)\)\[1\]/i);
    expect(sql).toMatch(/\(storage\.foldername\(name\)\)\[2\]/i);
    expect(sql).toMatch(/\(storage\.foldername\(name\)\)\[3\] = 'remittance_nf'/i);
    expect(sql).toMatch(/public\.contracts AS contract/i);
    expect(sql).toMatch(/contract\.id::text = \(storage\.foldername\(name\)\)\[2\]/i);
    expect(sql).toMatch(/contract\.organization_id::text = \(storage\.foldername\(name\)\)\[1\]/i);

    const insertPolicy = sql.match(
      /CREATE POLICY "Contract documents storage insert by organization members"[\s\S]*?WITH CHECK \([\s\S]*?\n\);/i
    )?.[0];

    expect(insertPolicy).toMatch(/contract\.kind = 'rental'/i);
    expect(insertPolicy).toMatch(/contract\.has_remittance_invoice = true/i);
  });

  it('allows storage DELETE only for an orphan owned by the authenticated user', () => {
    const sql = readRemittanceDocumentMigration();

    expect(sql).toMatch(/CREATE POLICY "Contract documents storage delete orphan uploads by owner"/i);
    expect(sql).toMatch(/FOR DELETE\s+TO authenticated\s+USING/i);
    expect(sql).toMatch(/owner_id = auth\.uid\(\)::text/i);
    expect(sql).toMatch(/NOT EXISTS\s*\([\s\S]*FROM public\.contract_documents AS document/i);
    expect(sql).toMatch(/document\.kind = 'remittance_nf'/i);
    expect(sql).toMatch(/document\.storage_path = storage\.objects\.name/i);
    expect(sql).not.toMatch(/GRANT [^;]*DELETE[^;]*ON storage\.objects/i);
  });

  it('protects a registered storage object from the orphan cleanup policy', () => {
    const sql = readRemittanceDocumentMigration();

    expect(sql).toMatch(/NOT EXISTS\s*\([\s\S]*document\.organization_id = contract\.organization_id/i);
    expect(sql).toMatch(/document\.contract_id = contract\.id/i);
    expect(sql).toMatch(/document\.storage_path = storage\.objects\.name/i);
  });

  it('binds orphan cleanup to an existing contract in the same member organization', () => {
    const sql = readRemittanceDocumentMigration();

    expect(sql).toMatch(/JOIN public\.organization_members AS membership\s+ON membership\.organization_id = contract\.organization_id/i);
    expect(sql).toMatch(/membership\.user_id = auth\.uid\(\)/i);
    expect(sql).toMatch(/contract\.organization_id::text = \(storage\.foldername\(name\)\)\[1\]/i);
    expect(sql).toMatch(/contract\.id::text = \(storage\.foldername\(name\)\)\[2\]/i);
  });

  it('requires exactly three storage folders and rejects nested remittance paths', () => {
    const sql = readRemittanceDocumentMigration();

    expect(sql.match(/array_length\(storage\.foldername\(name\), 1\) = 3/gi)).toHaveLength(3);
    expect(sql).not.toMatch(/array_length\(storage\.foldername\(name\), 1\) (?:>=|>) 3/i);
  });

  it('adds sent_at without adding sent to the billing_status enum', () => {
    const sql = readBillingSentAtAndPaymentProofsMigration();

    expect(sql).toMatch(/ALTER TABLE public\.billing_cycles/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS sent_at timestamptz/i);
    expect(sql).not.toMatch(/ALTER TYPE public\.billing_status/i);
    expect(sql).not.toMatch(/\bADD VALUE\b[\s\S]*'sent'/i);
  });

  it('links payment proof documents to the matching organization, contract, billing cycle and payment', () => {
    const sql = readBillingSentAtAndPaymentProofsMigration();

    expect(sql).toMatch(/ALTER TABLE public\.contract_documents/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS payment_id uuid/i);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS billing_cycles_org_contract_id_uidx/i);
    expect(sql).toMatch(/ON public\.billing_cycles \(organization_id, contract_id, id\)/i);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS payments_org_billing_cycle_id_uidx/i);
    expect(sql).toMatch(/ON public\.payments \(organization_id, billing_cycle_id, id\)/i);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS contract_documents_org_contract_billing_idx/i);
    expect(sql).toMatch(/ON public\.contract_documents \(organization_id, contract_id, billing_cycle_id\)/i);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS contract_documents_org_billing_payment_idx/i);
    expect(sql).toMatch(/ON public\.contract_documents \(organization_id, billing_cycle_id, payment_id\)/i);
    expect(sql).toMatch(/FOREIGN KEY \(organization_id, contract_id, billing_cycle_id\)\s+REFERENCES public\.billing_cycles \(organization_id, contract_id, id\)/i);
    expect(sql).toMatch(/FOREIGN KEY \(organization_id, billing_cycle_id, payment_id\)\s+REFERENCES public\.payments \(organization_id, billing_cycle_id, id\)/i);
  });

  it('keeps legacy payment proof documents compatible while limiting new proof duplication by payment', () => {
    const sql = readBillingSentAtAndPaymentProofsMigration();

    expect(sql).not.toMatch(/CHECK\s*\([^;]*kind\s*=\s*'payment_proof'[^;]*payment_id\s+IS\s+NOT\s+NULL/i);
    expect(sql).toMatch(/ADD CONSTRAINT contract_documents_payment_proof_required_fields_chk/i);
    expect(sql).toMatch(/kind <> 'payment_proof'/i);
    expect(sql).toMatch(/payment_id IS NOT NULL/i);
    expect(sql).toMatch(/billing_cycle_id IS NOT NULL/i);
    expect(sql).toMatch(/content_type IN \('application\/pdf', 'image\/png', 'image\/jpeg'\)/i);
    expect(sql).toMatch(/contract_documents_payment_proof_required_fields_chk[\s\S]*NOT VALID/i);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS contract_documents_one_payment_proof_per_payment_uidx/i);
    expect(sql).toMatch(/WHERE kind = 'payment_proof' AND payment_id IS NOT NULL/i);
  });

  it('extends contract document storage policies only for remittance NF and payment proofs', () => {
    const sql = readBillingSentAtAndPaymentProofsMigration();

    expect(sql).toMatch(/CREATE POLICY "Contract documents storage read by organization members"/i);
    expect(sql).toMatch(/CREATE POLICY "Contract documents storage insert by organization members"/i);
    expect(sql).toMatch(/CREATE POLICY "Contract documents storage delete orphan uploads by owner"/i);
    expect(sql.match(/array_length\(storage\.foldername\(name\), 1\) = 3/gi)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(sql).toMatch(/\(storage\.foldername\(name\)\)\[3\] IN \('remittance_nf', 'payment_proof'\)/i);
    expect(sql).toMatch(/\(storage\.foldername\(name\)\)\[3\] = 'payment_proof'/i);
    expect(sql).toMatch(/FROM public\.payments AS payment/i);
    expect(sql).toMatch(/JOIN public\.billing_cycles AS billing/i);
    expect(sql).toMatch(/storage\.objects\.metadata ->> 'mimetype'/i);
    expect(sql).toMatch(/'application\/pdf', 'image\/png', 'image\/jpeg'/i);
    expect(sql).toMatch(/substring\(\s*storage\.filename\(name\)\s+from\s+'\^\[0-9a-fA-F\]\{8\}/i);
    expect(sql).not.toMatch(/left\(storage\.filename\(name\), 36\)::uuid/i);
    expect(sql).not.toMatch(/bucket_id = 'contratos-locacoes-docs'[\s\S]*array_length\(storage\.foldername\(name\), 1\) >= 1/i);
  });

  it('adds rental_assets with organization-scoped RLS, conservative grants and asset-linked rental items', () => {
    const sql = readRentalAssetsMigration();

    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.rental_assets/i);
    expect(sql).toMatch(/organization_id uuid NOT NULL REFERENCES public\.organizations\(id\)/i);
    expect(sql).toMatch(/operational_status text NOT NULL DEFAULT 'active'/i);
    expect(sql).toMatch(/CHECK \(operational_status IN \('active', 'maintenance', 'inactive', 'retired'\)\)/i);
    expect(sql).toMatch(/CONSTRAINT rental_assets_org_id_uidx UNIQUE \(organization_id, id\)/i);
    expect(sql).toMatch(/ALTER TABLE public\.rental_items[\s\S]*ADD COLUMN IF NOT EXISTS asset_id uuid/i);
    expect(sql).toMatch(/FOREIGN KEY \(organization_id, asset_id\)\s+REFERENCES public\.rental_assets \(organization_id, id\)/i);
    expect(sql).toMatch(/ALTER TABLE public\.rental_assets ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/CREATE POLICY "Rental Assets SELECT policy"/i);
    expect(sql).toMatch(/CREATE POLICY "Rental Assets INSERT policy"/i);
    expect(sql).toMatch(/CREATE POLICY "Rental Assets UPDATE policy"/i);
    expect(sql).toMatch(/is_organization_member\(organization_id\)/i);
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE ON public\.rental_assets TO authenticated/i);
    expect(sql).not.toMatch(/GRANT [^;]*ON public\.rental_assets TO anon/i);
    expect(sql).not.toMatch(/ALTER DEFAULT PRIVILEGES/i);
    expect(sql).not.toMatch(/service_role/i);
  });

  it('adds returned_at to rental_items without changing default ACL or unrelated tables', () => {
    const sql = readRentalReturnsMigration();

    expect(sql).toMatch(/ALTER TABLE public\.rental_items[\s\S]*ADD COLUMN IF NOT EXISTS returned_at date/i);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS rental_items_org_asset_returned_idx/i);
    expect(sql).toMatch(/ON public\.rental_items \(organization_id, asset_id, returned_at\)/i);
    expect(sql).not.toMatch(/ALTER DEFAULT PRIVILEGES/i);
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/GRANT/i);
    expect(sql).not.toMatch(/service_role/i);
  });

  it('protects physical asset bookings with transactional row locks and triggers', () => {
    const sql = readRentalAssetBookingProtectionMigration();

    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.assert_rental_asset_booking_available/i);
    expect(sql).toMatch(/SECURITY DEFINER/i);
    expect(sql).toMatch(/SET search_path = public/i);
    expect(sql).toMatch(/FOR UPDATE/i);
    expect(sql).toMatch(/FROM public\.rental_assets AS asset/i);
    expect(sql).toMatch(/asset_status <> 'active'/i);
    expect(sql).toMatch(/CREATE TRIGGER rental_items_asset_booking_guard_trig/i);
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE OF asset_id, status, returned_at, contract_id, organization_id/i);
    expect(sql).toMatch(/CREATE TRIGGER contracts_asset_booking_guard_trig/i);
    expect(sql).toMatch(/BEFORE UPDATE OF start_date, end_date, status, organization_id/i);
    expect(sql).toMatch(/other_contract\.status <> 'cancelled'/i);
    expect(sql).toMatch(/other_item\.asset_id = p_asset_id/i);
    expect(sql).toMatch(/other_item\.id <> p_rental_item_id/i);
    expect(sql).toMatch(/public\.is_organization_member\(p_organization_id\)/i);
  });

  it('revalidates existing physical assets when a contract enters rental kind', () => {
    const sql = readRentalAssetBookingProtectionMigration();

    expect(sql).toMatch(/p_contract_kind public\.contract_kind DEFAULT NULL/i);
    expect(sql).toMatch(/candidate_kind public\.contract_kind/i);
    expect(sql).toMatch(/candidate_kind := p_contract_kind/i);
    expect(sql).toMatch(/IF candidate_kind IS DISTINCT FROM 'rental' THEN\s+RETURN;/i);
    expect(sql).toMatch(/BEFORE UPDATE OF start_date, end_date, status, organization_id, kind/i);
    expect(sql).toMatch(/IF NEW\.kind <> 'rental' THEN\s+RETURN NEW;/i);
    expect(sql).toMatch(/old_contract_booking_blocks := OLD\.kind = 'rental'/i);
    expect(sql).toMatch(/new_contract_booking_blocks := NEW\.kind = 'rental'/i);
    expect(sql).toMatch(/NOT old_contract_booking_blocks\s+AND new_contract_booking_blocks/i);
    expect(sql).not.toMatch(/AND contract\.kind = 'rental'/i);
  });

  it('requires active assets when a contract update makes existing physical items block again', () => {
    const sql = readRentalAssetBookingProtectionMigration();

    expect(sql).toMatch(/old_contract_booking_blocks boolean/i);
    expect(sql).toMatch(/new_contract_booking_blocks boolean/i);
    expect(sql).toMatch(/old_contract_booking_blocks := OLD\.kind = 'rental'\s+AND OLD\.status <> 'cancelled'/i);
    expect(sql).toMatch(/new_contract_booking_blocks := NEW\.kind = 'rental'\s+AND NEW\.status <> 'cancelled'/i);
    expect(sql).toMatch(/linked_item\.returned_at IS NOT NULL\s+OR OLD\.status = 'closed'/i);
    expect(sql).toMatch(/linked_item\.returned_at IS NOT NULL\s+OR NEW\.status = 'closed'/i);
    expect(sql).toMatch(/linked_item\.status IN \('rented', 'lost_damaged', 'suspended_exempt'\)\s+AND OLD\.status IN \('active', 'paused', 'closing_requested', 'awaiting_return', 'inspection'\)/i);
    expect(sql).toMatch(/linked_item\.status IN \('rented', 'lost_damaged', 'suspended_exempt'\)\s+AND NEW\.status IN \('active', 'paused', 'closing_requested', 'awaiting_return', 'inspection'\)/i);
    expect(sql).toMatch(/p_require_active => \(\s+NOT old_contract_booking_blocks\s+AND new_contract_booking_blocks\s+\)/i);
    expect(sql).not.toMatch(/OLD\.kind IS DISTINCT FROM 'rental'\s+AND NEW\.kind = 'rental'/i);
  });

  it('requires active assets only for new physical allocations', () => {
    const sql = readRentalAssetBookingProtectionMigration();

    expect(sql).toMatch(/p_require_active boolean DEFAULT true/i);
    expect(sql).toMatch(/IF p_require_active AND asset_status <> 'active' THEN/i);
    expect(sql).toMatch(/TG_OP = 'INSERT'/i);
    expect(sql).toMatch(/OLD\.asset_id IS DISTINCT FROM NEW\.asset_id/i);
    expect(sql).toMatch(/OLD\.contract_id IS DISTINCT FROM NEW\.contract_id/i);
    expect(sql).toMatch(/OLD\.organization_id IS DISTINCT FROM NEW\.organization_id/i);
    expect(sql).toMatch(/NOT old_contract_booking_blocks\s+AND new_contract_booking_blocks/i);
  });

  it('requires active assets when an existing physical item is reoccupied', () => {
    const sql = readRentalAssetBookingProtectionMigration();

    expect(sql).toMatch(/old_item_occupies boolean/i);
    expect(sql).toMatch(/new_item_occupies boolean/i);
    expect(sql).toMatch(/old_item_occupies := OLD\.asset_id IS NOT NULL\s+AND OLD\.returned_at IS NULL\s+AND OLD\.status IN \('rented', 'lost_damaged', 'suspended_exempt'\)/i);
    expect(sql).toMatch(/new_item_occupies := NEW\.asset_id IS NOT NULL\s+AND NEW\.returned_at IS NULL\s+AND NEW\.status IN \('rented', 'lost_damaged', 'suspended_exempt'\)/i);
    expect(sql).toMatch(/NOT old_item_occupies\s+AND new_item_occupies/i);
    expect(sql).not.toMatch(/OLD\.returned_at IS DISTINCT FROM NEW\.returned_at/i);
  });

  it('keeps rental asset booking protection grants minimal', () => {
    const sql = readRentalAssetBookingProtectionMigration();

    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.assert_rental_asset_booking_available/i);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.assert_rental_asset_booking_available[\s\S]*TO anon/i);
    expect(sql).not.toMatch(/TO anon/i);
    expect(sql).not.toMatch(/service_role/i);
    expect(sql).not.toMatch(/ALTER DEFAULT PRIVILEGES/i);
    expect(sql).not.toMatch(/CREATE TABLE/i);
  });

  it('removes direct execute grants from internal rental booking functions', () => {
    const sql = readRentalBookingFunctionExecuteRestrictionMigration();

    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.assert_rental_asset_booking_available\(\s*uuid,\s*uuid,\s*uuid,\s*uuid,\s*public\.rental_item_status,\s*date,\s*date,\s*date,\s*public\.contract_status,\s*public\.contract_kind,\s*boolean,\s*boolean\s*\)\s+FROM PUBLIC,\s*anon,\s*authenticated,\s*service_role/i);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.check_rental_asset_booking_item_trigger\(\)\s+FROM PUBLIC,\s*anon,\s*authenticated,\s*service_role/i);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.check_rental_asset_booking_contract_trigger\(\)\s+FROM PUBLIC,\s*anon,\s*authenticated,\s*service_role/i);
    expect(sql).not.toMatch(/GRANT EXECUTE/i);
    expect(sql).not.toMatch(/ALTER DEFAULT PRIVILEGES/i);
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION/i);
    expect(sql).not.toMatch(/CREATE TRIGGER/i);
  });
});
