import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = path.resolve(__dirname, '../../../supabase/migrations');

function readTransformadorMigration() {
  const matches = readdirSync(migrationsDir).filter((filename) =>
    /_relatorios_transformador_core\.sql$/i.test(filename)
  );

  expect(matches, 'expected exactly one Transformador core migration').toHaveLength(1);
  expect(Number(matches[0].slice(0, 12))).toBeGreaterThan(202607241220);

  return readFileSync(path.join(migrationsDir, matches[0]), 'utf8');
}

function readTransformadorRevisionFixMigration() {
  const filename = '202607301510_fix_transformador_revision_ambiguous_id.sql';
  return readFileSync(path.join(migrationsDir, filename), 'utf8');
}

describe('relatorios de transformador migration consistency', () => {
  it('creates organization-owned report and monthly counter tables with the used columns', () => {
    const sql = readTransformadorMigration();

    expect(sql).toMatch(/CREATE TABLE public\.transformador_report_counters/i);
    expect(sql).toMatch(/CREATE TABLE public\.relatorios_transformador/i);
    expect(sql).toMatch(/organization_id uuid NOT NULL REFERENCES public\.organizations \(id\)/i);
    expect(sql).toMatch(/criado_por uuid DEFAULT auth\.uid\(\) REFERENCES auth\.users \(id\) ON DELETE SET NULL/i);

    for (const column of [
      'numero_relatorio',
      'cliente_nome',
      'cliente_endereco',
      'cliente_cidade',
      'cliente_uf',
      'fabricante',
      'numero_serie',
      'potencia_kva',
      'tensao_at_nominal',
      'tensao_bt',
      'tensao_bt_label',
      'tap_despacho',
      'taps',
      'valores_calculados',
      'data_relatorio',
    ]) {
      expect(sql).toMatch(new RegExp(`\\b${column}\\b`, 'i'));
    }

    expect(sql).toMatch(/taps integer\[\] NOT NULL/i);
    expect(sql).toMatch(/valores_calculados jsonb NOT NULL/i);
    expect(sql).not.toMatch(/storage\.buckets/i);
  });

  it('generates RT-YYYYMM-NNN numbers safely by organization and month', () => {
    const sql = readTransformadorMigration();

    expect(sql).toMatch(/report_month integer NOT NULL/i);
    expect(sql).toMatch(/sequence_number integer NOT NULL CHECK \(sequence_number >= 1\)/i);
    expect(sql).toMatch(/PRIMARY KEY \(organization_id, report_month\)/i);
    expect(sql).toMatch(
      /CONSTRAINT relatorios_transformador_org_month_sequence_uidx UNIQUE \(organization_id, report_month, sequence_number\)/i
    );
    expect(sql).toMatch(
      /CONSTRAINT relatorios_transformador_org_numero_uidx UNIQUE \(organization_id, numero_relatorio\)/i
    );
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.set_transformador_report_number\(\)/i);
    expect(sql).toMatch(/ON CONFLICT \(organization_id, report_month\)[\s\S]*DO UPDATE/i);
    expect(sql).toMatch(/NEW\.report_month := to_char\(COALESCE\(NEW\.data_relatorio, now\(\)::date\), 'YYYYMM'\)::integer/i);
    expect(sql).toMatch(/NEW\.numero_relatorio := 'RT-' \|\| NEW\.report_month \|\| '-' \|\| lpad\(generated_sequence::text, 3, '0'\)/i);
    expect(sql).not.toMatch(/\bcount\s*\(/i);
  });

  it('stores explicit revision relationships without cascade deletion of history', () => {
    const sql = readTransformadorMigration();

    expect(sql).toMatch(/revised_from_id uuid,/i);
    expect(sql).toMatch(/superseded_by_id uuid,/i);
    expect(sql).toMatch(
      /FOREIGN KEY \(organization_id, revised_from_id\)[\s\S]*REFERENCES public\.relatorios_transformador \(organization_id, id\)[\s\S]*ON DELETE RESTRICT/i
    );
    expect(sql).toMatch(
      /FOREIGN KEY \(organization_id, superseded_by_id\)[\s\S]*REFERENCES public\.relatorios_transformador \(organization_id, id\)[\s\S]*ON DELETE RESTRICT/i
    );
    expect(sql).toMatch(/CHECK \(status IN \('gerado', 'revisado', 'emitido', 'cancelado'\)\)/i);
    expect(sql).not.toMatch(/ON DELETE CASCADE/i);
  });

  it('creates an atomic revision RPC that inserts the replacement and updates the original', () => {
    const sql = readTransformadorMigration();

    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.create_transformador_revision\(/i);
    expect(sql).toMatch(/p_organization_id uuid/i);
    expect(sql).toMatch(/p_original_id uuid/i);
    expect(sql).toMatch(/p_report jsonb/i);
    expect(sql).toMatch(/IF auth\.uid\(\) IS NULL THEN/i);
    expect(sql).toMatch(/public\.is_organization_member\(p_organization_id\)/i);
    expect(sql).toMatch(
      /SELECT[\s\S]*INTO original_report[\s\S]*FOR UPDATE/i
    );
    expect(sql).toMatch(/original_report\.organization_id <> p_organization_id/i);
    expect(sql).toMatch(/original_report\.status IN \('cancelado', 'revisado'\)/i);
    expect(sql).toMatch(/original_report\.superseded_by_id IS NOT NULL/i);
    expect(sql).toMatch(
      /INSERT INTO public\.relatorios_transformador[\s\S]*revised_from_id[\s\S]*VALUES[\s\S]*p_original_id[\s\S]*RETURNING relatorios_transformador\.id, relatorios_transformador\.numero_relatorio[\s\S]*INTO new_report/i
    );
    expect(sql).toMatch(
      /UPDATE public\.relatorios_transformador[\s\S]*status = 'revisado'[\s\S]*superseded_by_id = new_report\.id[\s\S]*WHERE id = p_original_id[\s\S]*AND organization_id = p_organization_id/i
    );
    expect(sql).toMatch(/RETURN QUERY SELECT new_report\.id, new_report\.numero_relatorio/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.create_transformador_revision\(uuid, uuid, jsonb\) FROM PUBLIC/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_transformador_revision\(uuid, uuid, jsonb\) TO authenticated/i);
  });

  it('uses membership RLS, scoped authenticated grants, and immutable numbering fields', () => {
    const sql = readTransformadorMigration();

    expect(sql).toMatch(/ALTER TABLE public\.relatorios_transformador ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/ALTER TABLE public\.transformador_report_counters ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/REVOKE ALL ON public\.relatorios_transformador, public\.transformador_report_counters FROM anon/i);
    expect(sql).not.toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON public\.relatorios_transformador TO authenticated/i);
    expect(sql).toMatch(/GRANT SELECT, INSERT, DELETE ON public\.relatorios_transformador TO authenticated/i);
    const updateGrant = sql.match(/GRANT UPDATE \(([\s\S]*?)\) ON public\.relatorios_transformador TO authenticated/i)?.[1] ?? '';
    expect(updateGrant).toMatch(/\bstatus\b/i);
    expect(updateGrant).not.toMatch(/\brevised_from_id\b/i);
    expect(updateGrant).not.toMatch(/\bsuperseded_by_id\b/i);
    expect(sql).not.toMatch(/GRANT\s+[^;]*ON public\.transformador_report_counters TO authenticated/i);

    for (const operation of ['SELECT', 'INSERT', 'UPDATE']) {
      expect(sql).toMatch(
        new RegExp(
          `CREATE POLICY "relatorios_transformador ${operation.toLowerCase()} by organization members"[\\s\\S]*?FOR ${operation}[\\s\\S]*?TO authenticated`,
          'i'
        )
      );
    }
    expect(sql).toMatch(
      /CREATE POLICY "relatorios_transformador delete canceled unlinked by organization members"[\s\S]*?FOR DELETE[\s\S]*?TO authenticated/i
    );

    expect(sql).toMatch(/public\.is_organization_member\(organization_id\)/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.protect_relatorios_transformador_numbering\(\)/i);
    for (const column of ['organization_id', 'report_month', 'sequence_number', 'numero_relatorio']) {
      expect(sql).toMatch(new RegExp(`OLD\\.${column} IS DISTINCT FROM NEW\\.${column}`, 'i'));
    }
    expect(sql).not.toMatch(/USING\s*\(\s*true\s*\)/i);
    expect(sql).not.toMatch(/service_role|iurqgskfuupslrghgtej/i);
  });

  it('blocks direct revision history mutations while allowing the revision RPC path', () => {
    const sql = readTransformadorMigration();

    expect(sql).toMatch(/current_setting\('app\.transformador_revision_rpc', true\) IS DISTINCT FROM 'on'/i);
    expect(sql).toMatch(/set_config\('app\.transformador_revision_rpc', 'on', true\)/i);
    expect(sql).toMatch(/OLD\.revised_from_id IS DISTINCT FROM NEW\.revised_from_id/i);
    expect(sql).toMatch(/OLD\.superseded_by_id IS DISTINCT FROM NEW\.superseded_by_id/i);
    expect(sql).toMatch(/NEW\.status = 'revisado'[\s\S]*current_setting\('app\.transformador_revision_rpc', true\) IS DISTINCT FROM 'on'/i);
    expect(sql).toMatch(/OLD\.status IN \('revisado', 'cancelado'\)[\s\S]*OLD\.status IS DISTINCT FROM NEW\.status/i);
    expect(sql).toMatch(/TG_OP = 'INSERT'[\s\S]*NEW\.revised_from_id IS NOT NULL/i);
    expect(sql).toMatch(/TG_OP = 'INSERT'[\s\S]*NEW\.superseded_by_id IS NOT NULL/i);
  });

  it('allows direct deletion only for canceled reports outside revision chains', () => {
    const sql = readTransformadorMigration();

    expect(sql).toMatch(
      /CREATE POLICY "relatorios_transformador delete canceled unlinked by organization members"[\s\S]*FOR DELETE[\s\S]*USING \([\s\S]*public\.is_organization_member\(organization_id\)[\s\S]*status = 'cancelado'[\s\S]*revised_from_id IS NULL[\s\S]*superseded_by_id IS NULL[\s\S]*\)/i
    );
  });

  it('fixes the revision RPC ambiguous return column names without changing other objects', () => {
    const sql = readTransformadorRevisionFixMigration();

    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.create_transformador_revision\(/i);
    expect(sql).not.toMatch(/CREATE TABLE|CREATE POLICY|CREATE TRIGGER|ALTER TABLE|GRANT |REVOKE /i);
    expect(sql).toMatch(/RETURNS TABLE \(id uuid, numero_relatorio text\)/i);
    expect(sql).toMatch(/\bv_original_report_id uuid\b/i);
    expect(sql).toMatch(/\bv_new_report_id uuid\b/i);
    expect(sql).toMatch(/\bv_new_report_number text\b/i);
    expect(sql).toMatch(/FROM public\.relatorios_transformador AS original/i);
    expect(sql).toMatch(/WHERE original\.id = p_original_id/i);
    expect(sql).toMatch(/RETURNING inserted_report\.id, inserted_report\.numero_relatorio[\s\S]*INTO v_new_report_id, v_new_report_number/i);
    expect(sql).toMatch(/UPDATE public\.relatorios_transformador AS original_to_update[\s\S]*WHERE original_to_update\.id = v_original_report_id[\s\S]*AND original_to_update\.organization_id = p_organization_id/i);
    expect(sql).toMatch(/RETURN QUERY SELECT v_new_report_id AS id, v_new_report_number AS numero_relatorio/i);

    expect(sql).not.toMatch(/\bWHERE\s+id\s*=/i);
    expect(sql).not.toMatch(/\bRETURN QUERY SELECT\s+id\b/i);
    expect(sql).not.toMatch(/\bRETURN QUERY SELECT\s+numero_relatorio\b/i);
  });
});
