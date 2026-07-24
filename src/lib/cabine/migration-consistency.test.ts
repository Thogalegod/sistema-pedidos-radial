import { createHash } from 'node:crypto';
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

function readOrphanCleanupSelectMigration() {
  return readMigration(
    /_fix_cabine_orphan_cleanup_select\.sql$/i,
    'Cabine orphan cleanup SELECT'
  );
}

function migrationSha256(suffix: RegExp) {
  const [filename] = readdirSync(migrationsDir).filter((candidate) => suffix.test(candidate));
  const contents = readFileSync(path.join(migrationsDir, filename));

  return createHash('sha256').update(contents).digest('hex');
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

  it('selects only unreferenced Cabine objects for authenticated organization cleanup', () => {
    const sql = readOrphanCleanupSelectMigration();

    expect(sql).toMatch(
      /DROP POLICY IF EXISTS\s+"Cabine orphan documents selectable for cleanup by organization members"\s+ON storage\.objects;/i
    );
    expect(sql).toMatch(
      /CREATE POLICY\s+"Cabine orphan documents selectable for cleanup by organization members"\s+ON storage\.objects\s+FOR SELECT\s+TO authenticated\s+USING/i
    );
    expect(sql).toMatch(/bucket_id = 'documentos-cabine'/i);
    expect(sql).toMatch(/array_length\(storage\.foldername\(name\), 1\) = 2/i);
    expect(sql).toMatch(
      /\(storage\.foldername\(name\)\)\[2\]\s*~\*\s*'\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[1-5\]\[0-9a-f\]\{3\}-\[89ab\]\[0-9a-f\]\{3\}-\[0-9a-f\]\{12\}\$'/i
    );
    expect(sql).toMatch(
      /storage\.allow_any_operation\s*\(\s*ARRAY\[\s*'storage\.object\.delete'\s*,\s*'storage\.object\.delete_many'\s*\]\s*\)/i
    );

    for (const forbiddenOperation of [
      'storage.object.get_authenticated',
      'storage.object.get_signed',
      'storage.object.sign',
      'storage.object.list',
    ]) {
      expect(sql).not.toContain(`'${forbiddenOperation}'`);
    }
  });

  it('blocks other organizations and keeps referenced objects protected', () => {
    const sql = readOrphanCleanupSelectMigration();

    expect(sql).toMatch(
      /EXISTS\s*\([\s\S]*FROM public\.organizations AS organization[\s\S]*organization\.id::text = \(storage\.foldername\(name\)\)\[1\][\s\S]*public\.is_organization_member\(organization\.id\)[\s\S]*\)/i
    );
    expect(sql).toMatch(
      /NOT EXISTS\s*\([\s\S]*FROM public\.relatorios_cabine AS referenced_report[\s\S]*referenced_report\.organization_id::text\s*=\s*\(storage\.foldername\(name\)\)\[1\][\s\S]*referenced_report\.art_storage_path = storage\.objects\.name[\s\S]*\)/i
    );
    expect(sql).not.toMatch(/owner_id/i);
    expect(sql).not.toMatch(/service_role|\banon\b|USING\s*\(\s*true\s*\)/i);
  });

  it('leaves the applied core, registered-read and orphan-delete policies unchanged', () => {
    const storageSql = readStorageMigration();
    const cleanupSql = readOrphanCleanupSelectMigration();

    expect(migrationSha256(/_relatorios_cabine_core\.sql$/i)).toBe(
      '23ea72172452f5c45fd4a6992b604f95b8e88a286017c7031c5a99218596628b'
    );
    expect(migrationSha256(/_relatorios_cabine_storage\.sql$/i)).toBe(
      '7feec990859a6bd5ffc08d70bdef5dc6d915c244fab497625e3d88858649c992'
    );
    expect(storageSql).toMatch(
      /CREATE POLICY "Cabine documents storage read by organization members"[\s\S]*FOR SELECT[\s\S]*report\.art_storage_path = storage\.objects\.name/i
    );
    expect(storageSql).toMatch(
      /CREATE POLICY "Cabine documents storage delete by organization members"[\s\S]*FOR DELETE[\s\S]*NOT EXISTS/i
    );
    expect(cleanupSql).not.toMatch(
      /Cabine documents storage (?:read|delete) by organization members/i
    );
  });

  it('contains none of the prohibited access or cross-module patterns', () => {
    const sql = `${readCoreMigration()}\n${readStorageMigration()}\n${readOrphanCleanupSelectMigration()}`;

    expect(sql).not.toMatch(/service_role/i);
    expect(sql).not.toMatch(/iurqgskfuupslrghgtej/i);
    expect(sql).not.toMatch(/termografia/i);
    expect(sql).not.toMatch(/relatorios_transformador/i);
    expect(sql).not.toMatch(/USING\s*\(\s*true\s*\)/i);
    expect(sql).not.toMatch(/WITH CHECK\s*\(\s*true\s*\)/i);
  });
});
