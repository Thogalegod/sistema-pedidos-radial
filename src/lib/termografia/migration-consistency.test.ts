import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TERMOGRAFIA_DOCUMENT_BUCKET } from './paths';

const migrationsDir = path.resolve(__dirname, '../../../supabase/migrations');

function readMigration(suffix: RegExp, label: string) {
  const matches = readdirSync(migrationsDir).filter((filename) => suffix.test(filename));

  expect(matches, `expected exactly one ${label} migration`).toHaveLength(1);
  expect(Number(matches[0].slice(0, 12))).toBeGreaterThan(202607211500);

  return readFileSync(path.join(migrationsDir, matches[0]), 'utf8');
}

function readCoreMigration() {
  return readMigration(/_termografia_core\.sql$/i, 'Termografia core');
}

function readStorageMigration() {
  return readMigration(/_termografia_storage\.sql$/i, 'Termografia storage');
}

function extractSqlBlock(sql: string, start: RegExp, end: RegExp) {
  const startMatch = start.exec(sql);
  expect(startMatch, `expected SQL block start ${start}`).not.toBeNull();

  const afterStart = sql.slice(startMatch!.index);
  const endMatch = end.exec(afterStart.slice(startMatch![0].length));
  expect(endMatch, `expected SQL block end ${end}`).not.toBeNull();

  return afterStart.slice(0, startMatch![0].length + endMatch!.index);
}

describe('termografia migration consistency', () => {
  it('creates normalized organization-owned report, point, file and counter tables', () => {
    const sql = readCoreMigration();

    for (const table of [
      'relatorios_termografia',
      'termografia_pontos',
      'termografia_arquivos',
      'termografia_report_counters',
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE public\\.${table}`, 'i'));
      expect(sql).toMatch(
        new RegExp(`CREATE TABLE public\\.${table}[\\s\\S]*?organization_id uuid NOT NULL`, 'i')
      );
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'));
    }

    expect(sql).not.toMatch(/pontos JSONB/i);
  });

  it('generates RT-YYYY-NNN report numbers safely by organization and year', () => {
    const sql = readCoreMigration();

    expect(sql).toMatch(/report_year integer NOT NULL/i);
    expect(sql).toMatch(/sequence_number integer NOT NULL/i);
    expect(sql).toMatch(/sequence_number integer NOT NULL CHECK \(sequence_number >= 1\)/i);
    expect(sql).not.toMatch(/sequence_number[^,\n]*<= 999/i);
    expect(sql).toMatch(
      /CONSTRAINT relatorios_termografia_org_year_sequence_uidx UNIQUE \(organization_id, report_year, sequence_number\)/i
    );
    expect(sql).toMatch(
      /CONSTRAINT relatorios_termografia_org_numero_uidx UNIQUE \(organization_id, numero_relatorio\)/i
    );
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.set_termografia_report_number\(\)/i);
    expect(sql).toMatch(/ON CONFLICT \(organization_id, report_year\)[\s\S]*DO UPDATE/i);
    expect(sql).toMatch(/NEW\.report_year := EXTRACT\(YEAR FROM COALESCE\(NEW\.data_execucao, now\(\)\)\)::integer/i);
    expect(sql).toMatch(/NEW\.sequence_number := generated_sequence/i);
    expect(sql).toMatch(/NEW\.numero_relatorio := 'RT-' \|\| NEW\.report_year \|\| '-' \|\| lpad\(generated_sequence::text, 3, '0'\)/i);
    expect(sql).toMatch(/'RT-' \|\| NEW\.report_year \|\| '-' \|\| lpad\(generated_sequence::text, 3, '0'\)/i);
    expect(sql).not.toMatch(/IF NEW\.sequence_number IS NULL OR NEW\.sequence_number = 0/i);
    expect(sql).not.toMatch(/generated_sequence := NEW\.sequence_number/i);
    expect(sql).not.toMatch(/IF NEW\.numero_relatorio IS NULL OR NEW\.numero_relatorio = ''/i);
    expect(sql).not.toMatch(/count\(\)/i);
  });

  it('uses organization-scoped foreign keys and protects stored file references', () => {
    const sql = readCoreMigration();

    expect(sql).toMatch(
      /CONSTRAINT termografia_pontos_org_report_id_uidx UNIQUE \(organization_id, report_id, id\)/i
    );
    expect(sql).toMatch(
      /FOREIGN KEY \(organization_id, report_id\)[\s\S]*REFERENCES public\.relatorios_termografia \(organization_id, id\)/i
    );
    expect(sql).toMatch(
      /CONSTRAINT termografia_arquivos_point_report_org_fkey[\s\S]*FOREIGN KEY \(organization_id, report_id, point_id\)[\s\S]*REFERENCES public\.termografia_pontos \(organization_id, report_id, id\)/i
    );
    expect(sql).toMatch(
      /CONSTRAINT termografia_arquivos_storage_path_uidx UNIQUE \(storage_path\)/i
    );
    expect(sql).toMatch(
      /CONSTRAINT termografia_arquivos_tipo_check CHECK \(tipo IN \('digital', 'termica'\)\)/i
    );
    expect(sql).toMatch(
      /CONSTRAINT termografia_arquivos_storage_path_check[\s\S]*storage_path = organization_id::text \|\| '\/' \|\| report_id::text \|\| '\/' \|\| point_id::text \|\| '\/' \|\| file_name/i
    );
    expect(sql).not.toMatch(
      /CONSTRAINT termografia_arquivos_storage_path_check[\s\S]*storage_path LIKE organization_id::text \|\| '\/' \|\| report_id::text \|\| '\/' \|\| point_id::text \|\| '\/%'/i
    );
    expect(sql).toMatch(
      /CONSTRAINT termografia_arquivos_file_name_check[\s\S]*file_name <> ''[\s\S]*file_name <> '\.'[\s\S]*file_name <> '\.\.'[\s\S]*file_name NOT LIKE '%\/%'[\s\S]*file_name NOT LIKE '%\\\\%'/i
    );
    expect(sql).toMatch(
      /CONSTRAINT termografia_arquivos_content_type_check CHECK \(content_type LIKE 'image\/%'\)/i
    );
  });

  it('blocks updates to report numbering and structural child keys', () => {
    const sql = readCoreMigration();

    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.protect_relatorios_termografia_numbering\(\)/i);
    for (const column of ['organization_id', 'report_year', 'sequence_number', 'numero_relatorio']) {
      expect(sql).toMatch(new RegExp(`OLD\\.${column} IS DISTINCT FROM NEW\\.${column}`, 'i'));
    }
    expect(sql).toMatch(
      /CREATE TRIGGER protect_relatorios_termografia_numbering_trig[\s\S]*BEFORE UPDATE ON public\.relatorios_termografia[\s\S]*EXECUTE FUNCTION public\.protect_relatorios_termografia_numbering\(\)/i
    );

    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.protect_termografia_pontos_structural_fields\(\)/i);
    for (const column of ['organization_id', 'report_id']) {
      expect(sql).toMatch(new RegExp(`OLD\\.${column} IS DISTINCT FROM NEW\\.${column}`, 'i'));
    }
    expect(sql).toMatch(
      /CREATE TRIGGER protect_termografia_pontos_structural_fields_trig[\s\S]*BEFORE UPDATE ON public\.termografia_pontos[\s\S]*EXECUTE FUNCTION public\.protect_termografia_pontos_structural_fields\(\)/i
    );

    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.protect_termografia_arquivos_structural_fields\(\)/i);
    for (const column of ['organization_id', 'report_id', 'point_id', 'storage_path', 'tipo']) {
      expect(sql).toMatch(new RegExp(`OLD\\.${column} IS DISTINCT FROM NEW\\.${column}`, 'i'));
    }
    expect(sql).toMatch(
      /CREATE TRIGGER protect_termografia_arquivos_structural_fields_trig[\s\S]*BEFORE UPDATE ON public\.termografia_arquivos[\s\S]*EXECUTE FUNCTION public\.protect_termografia_arquivos_structural_fields\(\)/i
    );
  });

  it('uses membership RLS and authenticated grants without created_by-only policies', () => {
    const sql = readCoreMigration();

    expect(sql).toMatch(/REVOKE ALL ON public\.relatorios_termografia, public\.termografia_pontos, public\.termografia_arquivos, public\.termografia_report_counters FROM PUBLIC/i);
    expect(sql).toMatch(/REVOKE ALL ON public\.relatorios_termografia, public\.termografia_pontos, public\.termografia_arquivos, public\.termografia_report_counters FROM anon/i);
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON public\.relatorios_termografia, public\.termografia_pontos, public\.termografia_arquivos TO authenticated/i);
    expect(sql).not.toMatch(/GRANT\s+[^;]*ON public\.termografia_report_counters TO authenticated/i);

    for (const table of ['relatorios_termografia', 'termografia_pontos', 'termografia_arquivos']) {
      for (const operation of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        expect(sql).toMatch(
          new RegExp(`CREATE POLICY "${table} ${operation.toLowerCase()} by organization members"[\\s\\S]*?FOR ${operation}[\\s\\S]*?TO authenticated`, 'i')
        );
      }
    }

    expect(sql).toMatch(/public\.is_organization_member\(organization_id\)/i);
    expect(sql).not.toMatch(/auth\.uid\(\) = created_by/i);
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]*?TO anon/i);
  });

  it('creates private storage with exact organization/report/point paths and orphan cleanup', () => {
    const sql = readStorageMigration();

    expect(sql).toMatch(/INSERT INTO storage\.buckets/i);
    expect(sql).toMatch(new RegExp(`'${TERMOGRAFIA_DOCUMENT_BUCKET}'`, 'i'));
    expect(sql).toMatch(/false,\s*10485760/i);
    expect(sql).toMatch(/'image\/\*'/i);
    expect(sql.match(/array_length\(storage\.foldername\(name\), 1\) = 3/gi)).toHaveLength(3);
    expect(sql).not.toMatch(/array_length\(storage\.foldername\(name\), 1\) = 4/i);
    expect(sql).not.toMatch(/storage\.foldername\(name\)\)\[4\]/i);
    expect(sql).toMatch(/point\.organization_id::text = \(storage\.foldername\(name\)\)\[1\]/i);
    expect(sql).toMatch(/point\.report_id::text = \(storage\.foldername\(name\)\)\[2\]/i);
    expect(sql).toMatch(/point\.id::text = \(storage\.foldername\(name\)\)\[3\]/i);
    expect(sql).toMatch(/NOT EXISTS[\s\S]*FROM public\.termografia_arquivos AS referenced_file/i);
    expect(sql).toMatch(/storage\.allow_any_operation[\s\S]*'storage\.object\.delete'[\s\S]*'storage\.object\.delete_many'/i);
    expect(sql).not.toMatch(/upsert:\s*true/i);
    expect(sql).not.toMatch(/owner_id/i);
  });

  it('allows registered storage objects to be deleted before their file rows are removed', () => {
    const sql = readStorageMigration();
    const registeredDeletePolicy = extractSqlBlock(
      sql,
      /CREATE POLICY "Termografia images storage delete registered by organization members"/i,
      /CREATE POLICY "Termografia images storage delete orphan by organization members"/i
    );

    expect(registeredDeletePolicy).toMatch(/FOR DELETE/i);
    expect(registeredDeletePolicy).toMatch(/bucket_id = 'termografia-docs'/i);
    expect(registeredDeletePolicy).toMatch(/array_length\(storage\.foldername\(name\), 1\) = 3/i);
    expect(registeredDeletePolicy.match(/storage\.foldername\(name\)\)\[\d\]\s*~\*/gi)).toHaveLength(3);
    expect(registeredDeletePolicy).toMatch(/FROM public\.termografia_arquivos AS registered_file/i);
    expect(registeredDeletePolicy).toMatch(/registered_file\.storage_path = storage\.objects\.name/i);
    expect(registeredDeletePolicy).toMatch(/registered_file\.organization_id = point\.organization_id/i);
    expect(registeredDeletePolicy).toMatch(/registered_file\.report_id = point\.report_id/i);
    expect(registeredDeletePolicy).toMatch(/registered_file\.point_id = point\.id/i);
    expect(registeredDeletePolicy).toMatch(/public\.is_organization_member\(point\.organization_id\)/i);
    expect(registeredDeletePolicy).not.toMatch(/is_termografia_storage_orphan_cleanup_object/i);
  });

  it('limits orphan cleanup to delete context without requiring live point or report rows', () => {
    const sql = readStorageMigration();
    const cleanupHelper = extractSqlBlock(
      sql,
      /CREATE OR REPLACE FUNCTION public\.is_termografia_storage_orphan_cleanup_object\(/i,
      /REVOKE ALL ON FUNCTION public\.is_termografia_storage_orphan_cleanup_object\(text\) FROM PUBLIC;/i
    );
    const deletePolicy = extractSqlBlock(
      sql,
      /CREATE POLICY "Termografia images storage delete orphan by organization members"/i,
      /CREATE POLICY "Termografia orphan images selectable for cleanup by organization members"/i
    );
    const cleanupSelectPolicy = sql.slice(
      sql.search(/CREATE POLICY "Termografia orphan images selectable for cleanup by organization members"/i)
    );

    for (const block of [cleanupHelper, deletePolicy, cleanupSelectPolicy]) {
      expect(block).toMatch(/termografia-docs|is_termografia_storage_orphan_cleanup_object/i);
      expect(block).not.toMatch(/FROM public\.termografia_pontos/i);
      expect(block).not.toMatch(/FROM public\.relatorios_termografia/i);
      expect(block).not.toMatch(/JOIN public\.termografia_pontos/i);
      expect(block).not.toMatch(/JOIN public\.relatorios_termografia/i);
    }

    expect(cleanupHelper).toMatch(/folders := storage\.foldername\(object_name\)/i);
    expect(cleanupHelper).toMatch(/array_length\(folders, 1\) <> 3/i);
    expect(cleanupHelper.match(/!\~\* '\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[1-5\]\[0-9a-f\]\{3\}-\[89ab\]\[0-9a-f\]\{3\}-\[0-9a-f\]\{12\}\$'/gi)).toHaveLength(3);
    expect(cleanupHelper).toMatch(/object_org_id := folders\[1\]::uuid/i);
    expect(cleanupHelper).toMatch(/public\.is_organization_member\(object_org_id\)/i);
    expect(cleanupHelper).toMatch(/NOT EXISTS[\s\S]*FROM public\.termografia_arquivos AS referenced_file/i);

    expect(cleanupSelectPolicy).toMatch(
      /storage\.allow_any_operation\s*\(\s*ARRAY\[\s*'storage\.object\.delete'\s*,\s*'storage\.object\.delete_many'\s*\]\s*\)/i
    );
    for (const forbiddenOperation of [
      'storage.object.get_authenticated',
      'storage.object.get_signed',
      'storage.object.sign',
      'storage.object.list',
    ]) {
      expect(cleanupSelectPolicy).not.toContain(`'${forbiddenOperation}'`);
    }
  });

  it('keeps security-sensitive functions pinned to expected privileges and search paths', () => {
    const coreSql = readCoreMigration();
    const storageSql = readStorageMigration();
    const numberFunction = extractSqlBlock(
      coreSql,
      /CREATE OR REPLACE FUNCTION public\.set_termografia_report_number\(\)/i,
      /REVOKE ALL ON FUNCTION public\.set_termografia_report_number\(\) FROM PUBLIC;/i
    );
    const orphanFunction = extractSqlBlock(
      storageSql,
      /CREATE OR REPLACE FUNCTION public\.is_termografia_storage_orphan_cleanup_object\(object_name text\)/i,
      /REVOKE ALL ON FUNCTION public\.is_termografia_storage_orphan_cleanup_object\(text\) FROM PUBLIC;/i
    );

    expect(numberFunction).toMatch(/SECURITY DEFINER/i);
    expect(numberFunction).toMatch(/SET search_path = public, pg_temp/i);
    expect(coreSql).toMatch(/REVOKE ALL ON FUNCTION public\.set_termografia_report_number\(\) FROM PUBLIC;/i);

    expect(orphanFunction).not.toMatch(/SECURITY DEFINER/i);
    expect(orphanFunction).toMatch(/SET search_path = public, pg_temp/i);
    expect(storageSql).toMatch(/REVOKE ALL ON FUNCTION public\.is_termografia_storage_orphan_cleanup_object\(text\) FROM PUBLIC;/i);
    expect(storageSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.is_termografia_storage_orphan_cleanup_object\(text\) TO authenticated;/i);
  });

  it('documents the expected deletion order before orphan cleanup is used', () => {
    const sql = readStorageMigration();

    expect(sql).toMatch(/Deletion flow/i);
    expect(sql).toMatch(/load public\.termografia_arquivos rows/i);
    expect(sql).toMatch(/remove Storage objects/i);
    expect(sql).toMatch(/remove public\.termografia_arquivos rows/i);
    expect(sql).toMatch(/then delete the point or report/i);
    expect(sql).toMatch(/limited orphan cleanup policy/i);
  });

  it('contains none of the prohibited backend or universal access patterns', () => {
    const sql = `${readCoreMigration()}\n${readStorageMigration()}`;

    expect(sql).not.toMatch(/service_role/i);
    expect(sql).not.toMatch(/iurqgskfuupslrghgtej/i);
    expect(sql).not.toMatch(/USING\s*\(\s*true\s*\)/i);
    expect(sql).not.toMatch(/WITH CHECK\s*\(\s*true\s*\)/i);
    expect(sql).not.toMatch(/storage_path LIKE organization_id::text \|\| '\/' \|\| report_id::text \|\| '\/' \|\| point_id::text \|\| '\/%'/i);
    expect(sql).not.toMatch(/storage\.foldername\(name\)\)\[4\]/i);
  });
});
