import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = path.resolve(__dirname, '../../../supabase/migrations');

function readMigration() {
  const matches = readdirSync(migrationsDir).filter((filename) =>
    /_manutencao_preventiva_cabine_core\.sql$/i.test(filename)
  );

  expect(matches, 'expected exactly one manutencao preventiva cabine core migration').toHaveLength(1);
  return readFileSync(path.join(migrationsDir, matches[0]), 'utf8');
}

function readDisjuntorMigration() {
  const matches = readdirSync(migrationsDir).filter((filename) =>
    /_manutencao_preventiva_disjuntor_15kv\.sql$/i.test(filename)
  );

  expect(matches, 'expected exactly one manutencao preventiva disjuntor migration').toHaveLength(1);
  return readFileSync(path.join(migrationsDir, matches[0]), 'utf8');
}

describe('manutencao preventiva cabine migration consistency', () => {
  it('creates only the approved base tables without storage or numbering', () => {
    const sql = readMigration();

    expect(sql.match(/CREATE TABLE public\.[a-z_]+/gi)).toEqual([
      'CREATE TABLE public.cabines_primarias',
      'CREATE TABLE public.cabine_equipamentos',
      'CREATE TABLE public.manutencoes_preventivas',
      'CREATE TABLE public.manutencao_fichas_transformador',
    ]);
    expect(sql).not.toMatch(/storage\.buckets|storage\.objects/i);
    expect(sql).not.toMatch(/counter|sequence|numero_(manutencao|relatorio)|proximo_numero/i);
  });

  it('binds customers, sites, cabines, equipments and maintenances by organization', () => {
    const sql = readMigration();

    expect(sql).toMatch(/ALTER TABLE public\.customer_sites[\s\S]*CONSTRAINT customer_sites_org_id_customer_id_uidx[\s\S]*UNIQUE \(organization_id, id, customer_id\)/i);
    expect(sql).toMatch(/cabines_primarias_customer_org_fkey[\s\S]*FOREIGN KEY \(organization_id, customer_id\)[\s\S]*REFERENCES public\.customers \(organization_id, id\)/i);
    expect(sql).toMatch(/cabines_primarias_site_customer_org_fkey[\s\S]*FOREIGN KEY \(organization_id, site_id, customer_id\)[\s\S]*REFERENCES public\.customer_sites \(organization_id, id, customer_id\)/i);
    expect(sql).toMatch(/cabine_equipamentos_cabine_org_fkey[\s\S]*FOREIGN KEY \(organization_id, cabine_id\)[\s\S]*REFERENCES public\.cabines_primarias \(organization_id, id\)/i);
    expect(sql).toMatch(/manutencoes_preventivas_cabine_org_fkey[\s\S]*FOREIGN KEY \(organization_id, cabine_id\)[\s\S]*REFERENCES public\.cabines_primarias \(organization_id, id\)/i);
    expect(sql).toMatch(/manutencao_fichas_transformador_manutencao_org_fkey[\s\S]*FOREIGN KEY \(organization_id, manutencao_id\)[\s\S]*REFERENCES public\.manutencoes_preventivas \(organization_id, id\)/i);
    expect(sql).toMatch(/manutencao_fichas_transformador_equipamento_org_fkey[\s\S]*FOREIGN KEY \(organization_id, equipamento_id\)[\s\S]*REFERENCES public\.cabine_equipamentos \(organization_id, id\)/i);
  });

  it('enforces transformer sheets against transformer equipment in the same cabine', () => {
    const sql = readMigration();

    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.validate_manutencao_ficha_transformador\(\)/i);
    expect(sql).toMatch(/equipment\.tipo <> 'transformador'/i);
    expect(sql).toMatch(/equipment\.cabine_id <> maintenance\.cabine_id/i);
    expect(sql).toMatch(/CREATE UNIQUE INDEX manutencao_fichas_transformador_org_manutencao_equipamento_uidx[\s\S]*\(organization_id, manutencao_id, equipamento_id\)/i);
  });

  it('makes structural relationships immutable after insert', () => {
    const sql = readMigration();

    expect(sql).toMatch(/NEW\.organization_id IS DISTINCT FROM OLD\.organization_id[\s\S]*organizacao do equipamento/i);
    expect(sql).toMatch(/NEW\.cabine_id IS DISTINCT FROM OLD\.cabine_id[\s\S]*cabine do equipamento/i);
    expect(sql).toMatch(/NEW\.tipo IS DISTINCT FROM OLD\.tipo[\s\S]*tipo do equipamento/i);
    expect(sql).toMatch(/NEW\.organization_id IS DISTINCT FROM OLD\.organization_id[\s\S]*organizacao da manutencao preventiva/i);
    expect(sql).toMatch(/NEW\.cabine_id IS DISTINCT FROM OLD\.cabine_id[\s\S]*cabine da manutencao preventiva/i);
    expect(sql).toMatch(/A organizacao da ficha do transformador nao pode ser alterada/i);
    expect(sql).toMatch(/A manutencao da ficha do transformador nao pode ser alterada/i);
    expect(sql).toMatch(/O equipamento da ficha do transformador nao pode ser alterado/i);
    expect(sql).not.toMatch(/UNION ALL|nao pode ser movido para cabine incompatavel/i);
  });

  it('sets and preserves created_by in the database', () => {
    const sql = readMigration();

    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.protect_created_by\(\)/i);
    expect(sql).toMatch(/TG_OP = 'INSERT'[\s\S]*auth\.uid\(\) IS NOT NULL[\s\S]*NEW\.created_by := auth\.uid\(\)/i);
    expect(sql).toMatch(/NEW\.created_by := OLD\.created_by/i);
    expect(sql.match(/EXECUTE FUNCTION public\.protect_created_by\(\)/gi)).toHaveLength(4);
    expect(sql.match(/created_by = auth\.uid\(\)/gi)).toHaveLength(4);
    expect(sql.match(/created_by uuid DEFAULT auth\.uid\(\) REFERENCES auth\.users \(id\) ON DELETE RESTRICT/gi)).toHaveLength(4);
    expect(sql).not.toMatch(/created_by[\s\S]{0,100}ON DELETE SET NULL/i);
  });

  it('adds the minimum indexes used by customer and equipment relationships', () => {
    const sql = readMigration();

    expect(sql).toMatch(/CREATE INDEX cabines_primarias_org_customer_idx[\s\S]*\(organization_id, customer_id\)/i);
    expect(sql).toMatch(/CREATE INDEX manutencao_fichas_transformador_org_equipamento_idx[\s\S]*\(organization_id, equipamento_id\)/i);
  });

  it('uses updated_at triggers, minimal grants and organization-member RLS for all tables', () => {
    const sql = readMigration();
    const tables = [
      'cabines_primarias',
      'cabine_equipamentos',
      'manutencoes_preventivas',
      'manutencao_fichas_transformador',
    ];

    for (const table of tables) {
      expect(sql).toMatch(new RegExp(`CREATE TRIGGER set_${table}_updated_at[\\s\\S]*ON public\\.${table}[\\s\\S]*update_updated_at_column\\(\\)`, 'i'));
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'));
      expect(sql).toMatch(new RegExp(`CREATE POLICY "${table} select by organization members"[\\s\\S]*ON public\\.${table}`, 'i'));
      expect(sql).toMatch(new RegExp(`CREATE POLICY "${table} insert by organization members"[\\s\\S]*ON public\\.${table}`, 'i'));
    }

    expect(sql).toMatch(/GRANT SELECT, INSERT ON public\.cabines_primarias TO authenticated/i);
    expect(sql).toMatch(/GRANT SELECT, INSERT ON public\.cabine_equipamentos TO authenticated/i);
    expect(sql).toMatch(/GRANT SELECT, INSERT ON public\.manutencoes_preventivas TO authenticated/i);
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE ON public\.manutencao_fichas_transformador TO authenticated/i);
    expect(sql).toMatch(/CREATE POLICY "manutencao_fichas_transformador update by organization members"[\s\S]*WITH CHECK \(public\.is_organization_member\(organization_id\)\)/i);
    expect(sql.match(/public\.is_organization_member\(organization_id\)/gi)?.length).toBeGreaterThanOrEqual(9);
    expect(sql).not.toMatch(/GRANT[\s\S]*DELETE|FOR DELETE|TO anon|service_role|USING\s*\(\s*true\s*\)|WITH CHECK\s*\(\s*true\s*\)/i);
  });

  it('proposes the minimum local migration for disjuntor 15 kV sheets', () => {
    const sql = readDisjuntorMigration();

    expect(sql).toMatch(/ALTER TABLE public\.cabine_equipamentos[\s\S]*DROP CONSTRAINT cabine_equipamentos_tipo_check,[\s\S]*ADD CONSTRAINT cabine_equipamentos_tipo_check[\s\S]*CHECK \(tipo IN \('transformador', 'disjuntor_15kv'\)\)/i);
    expect(sql).toMatch(/CHECK \(tipo IN \('transformador', 'disjuntor_15kv'\)\)/i);
    expect(sql).toMatch(/CREATE TABLE public\.manutencao_fichas_disjuntor/i);
    expect(sql).toMatch(/dados_ficha jsonb NOT NULL/i);
    expect(sql).toMatch(/CHECK \(jsonb_typeof\(dados_ficha\) = 'object'\)/i);
    expect(sql).toMatch(/FOREIGN KEY \(organization_id, manutencao_id\)[\s\S]*ON DELETE CASCADE[\s\S]*ON UPDATE NO ACTION/i);
    expect(sql).toMatch(/FOREIGN KEY \(organization_id, equipamento_id\)[\s\S]*ON DELETE RESTRICT[\s\S]*ON UPDATE NO ACTION/i);
    expect(sql).toMatch(/CREATE UNIQUE INDEX manutencao_fichas_disjuntor_org_manutencao_equipamento_uidx[\s\S]*\(organization_id, manutencao_id, equipamento_id\)/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.validate_manutencao_ficha_disjuntor\(\)/i);
    expect(sql).toMatch(/equipment\.tipo <> 'disjuntor_15kv'/i);
    expect(sql).toMatch(/equipment\.cabine_id <> maintenance\.cabine_id/i);
    expect(sql).toMatch(/EXECUTE FUNCTION public\.protect_created_by\(\)/i);
    expect(sql).toMatch(/CREATE TRIGGER set_manutencao_fichas_disjuntor_updated_at[\s\S]*EXECUTE FUNCTION public\.update_updated_at_column\(\)/i);
    expect(sql).toMatch(/ALTER TABLE public\.manutencao_fichas_disjuntor ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE ON public\.manutencao_fichas_disjuntor TO authenticated/i);
    expect(sql).not.toMatch(/GRANT DELETE/i);
    expect(sql).toMatch(/CREATE POLICY "manutencao_fichas_disjuntor select by organization members"/i);
    expect(sql).toMatch(/CREATE POLICY "manutencao_fichas_disjuntor insert by organization members"/i);
    expect(sql).toMatch(/CREATE POLICY "manutencao_fichas_disjuntor insert by organization members"[\s\S]*public\.is_organization_member\(organization_id\)[\s\S]*created_by = auth\.uid\(\)/i);
    expect(sql).toMatch(/CREATE POLICY "manutencao_fichas_disjuntor update by organization members"/i);
    expect(sql).not.toMatch(/storage\.buckets|storage\.objects|FOR DELETE|TO anon|service_role|USING\s*\(\s*true\s*\)|WITH CHECK\s*\(\s*true\s*\)/i);
  });
});
