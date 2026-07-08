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
});
