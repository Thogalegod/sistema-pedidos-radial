import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = path.resolve(__dirname, '../../../supabase/migrations');

function readMigration(suffix: RegExp, label: string) {
  const matches = readdirSync(migrationsDir).filter((filename) => suffix.test(filename));

  expect(matches, `expected exactly one ${label} migration`).toHaveLength(1);
  expect(Number(matches[0].slice(0, 12))).toBeGreaterThan(202607211130);

  return readFileSync(path.join(migrationsDir, matches[0]), 'utf8');
}

function readCoreMigration() {
  return readMigration(/_relatorios_cabine_core\.sql$/i, 'Cabine core');
}

function readStorageMigration() {
  return readMigration(/_relatorios_cabine_storage\.sql$/i, 'Cabine storage');
}

describe('relatorios de cabine migration consistency', () => {
  it('creates only the approved report table with mandatory organization ownership', () => {
    const sql = readCoreMigration();

    expect(sql.match(/CREATE TABLE public\.[a-z_]+/gi)).toEqual([
      'CREATE TABLE public.relatorios_cabine',
    ]);
    expect(sql).toMatch(/organization_id uuid NOT NULL REFERENCES public\.organizations \(id\)/i);
    expect(sql).toMatch(/legacy_id uuid,/i);
    expect(sql).toMatch(/CONSTRAINT relatorios_cabine_org_id_uidx UNIQUE \(organization_id, id\)/i);
    expect(sql).toMatch(
      /CONSTRAINT relatorios_cabine_org_numero_uidx UNIQUE \(organization_id, numero_relatorio\)/i
    );
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX relatorios_cabine_org_legacy_id_uidx[\s\S]*\(organization_id, legacy_id\)[\s\S]*WHERE legacy_id IS NOT NULL/i
    );
  });

  it('preserves historical fields and uses a nullable storage path instead of a URL', () => {
    const sql = readCoreMigration();

    for (const column of [
      'cliente_nome',
      'cliente_endereco',
      'cliente_cidade',
      'cliente_uf',
      'cliente_cep',
      'cliente_cnpj',
      'cliente_ie',
      'valores_calculados',
    ]) {
      expect(sql).toMatch(new RegExp(`\\b${column}\\b`, 'i'));
    }

    expect(sql).toMatch(/art_storage_path text,/i);
    expect(sql).not.toMatch(/art_storage_path text NOT NULL/i);
    expect(sql).not.toMatch(/art_arquivo_url/i);
    expect(sql).toMatch(
      /criado_por uuid DEFAULT auth\.uid\(\) REFERENCES auth\.users \(id\) ON DELETE SET NULL/i
    );
    expect(sql).toMatch(
      /status text NOT NULL DEFAULT 'gerado'[\s\S]*CHECK \(status IN \('gerado', 'revisado', 'emitido', 'cancelado'\)\)/i
    );
  });

  it('adds optional organization-safe customer, site and contact relations', () => {
    const sql = readCoreMigration();

    for (const column of ['customer_id', 'site_id', 'contact_id']) {
      expect(sql).toMatch(new RegExp(`${column} uuid,`, 'i'));
    }

    expect(sql).toMatch(
      /FOREIGN KEY \(organization_id, customer_id\)[\s\S]*REFERENCES public\.customers \(organization_id, id\)/i
    );
    expect(sql).toMatch(
      /FOREIGN KEY \(organization_id, site_id\)[\s\S]*REFERENCES public\.customer_sites \(organization_id, id\)/i
    );
    expect(sql).toMatch(
      /FOREIGN KEY \(organization_id, contact_id\)[\s\S]*REFERENCES public\.customer_contacts \(organization_id, id\)/i
    );
  });

  it('uses membership RLS and minimum authenticated grants without anon access', () => {
    const sql = readCoreMigration();

    expect(sql).toMatch(/ALTER TABLE public\.relatorios_cabine ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/REVOKE ALL ON public\.relatorios_cabine FROM PUBLIC/i);
    expect(sql).toMatch(/REVOKE ALL ON public\.relatorios_cabine FROM anon/i);
    expect(sql).toMatch(/REVOKE ALL ON public\.relatorios_cabine FROM authenticated/i);
    expect(sql).toMatch(
      /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.relatorios_cabine TO authenticated/i
    );

    for (const operation of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      expect(sql).toMatch(
        new RegExp(
          `CREATE POLICY "Cabine ${operation.toLowerCase()} by organization members"[\\s\\S]*?FOR ${operation}[\\s\\S]*?TO authenticated`,
          'i'
        )
      );
    }

    expect(sql.match(/public\.is_organization_member\(organization_id\)/gi)).toHaveLength(5);
    expect(sql).not.toMatch(/CREATE POLICY[^;]*TO anon/i);
    expect(sql).not.toMatch(/GRANT [^;]* TO anon/i);
  });

  it('creates a private PDF-only 10 MiB bucket with exact organization/report paths', () => {
    const sql = readStorageMigration();

    expect(sql).toMatch(/INSERT INTO storage\.buckets/i);
    expect(sql).toMatch(/'documentos-cabine'/i);
    expect(sql).toMatch(/false,\s*10485760,\s*ARRAY\[\s*'application\/pdf'\s*\]::text\[\]/i);
    expect(sql.match(/array_length\(storage\.foldername\(name\), 1\) = 2/gi)).toHaveLength(3);
    expect(sql).toMatch(/report\.organization_id::text = \(storage\.foldername\(name\)\)\[1\]/i);
    expect(sql).toMatch(/report\.id::text = \(storage\.foldername\(name\)\)\[2\]/i);

    for (const [name, operation] of [
      ['read', 'SELECT'],
      ['insert', 'INSERT'],
      ['delete', 'DELETE'],
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `CREATE POLICY "Cabine documents storage ${name} by organization members"[\\s\\S]*?FOR ${operation}[\\s\\S]*?TO authenticated`,
          'i'
        )
      );
    }

    expect(sql).toMatch(
      /NOT EXISTS[\s\S]*FROM public\.relatorios_cabine AS referenced_report[\s\S]*referenced_report\.art_storage_path = storage\.objects\.name/i
    );
    expect(sql).not.toMatch(/CREATE POLICY[^;]*FOR UPDATE/i);
  });

  it('contains none of the prohibited access or cross-module patterns', () => {
    const sql = `${readCoreMigration()}\n${readStorageMigration()}`;

    expect(sql).not.toMatch(/service_role/i);
    expect(sql).not.toMatch(/iurqgskfuupslrghgtej/i);
    expect(sql).not.toMatch(/termografia/i);
    expect(sql).not.toMatch(/relatorios_transformador/i);
    expect(sql).not.toMatch(/USING\s*\(\s*true\s*\)/i);
    expect(sql).not.toMatch(/WITH CHECK\s*\(\s*true\s*\)/i);
  });
});
