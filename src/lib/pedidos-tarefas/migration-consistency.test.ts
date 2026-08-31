import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = path.resolve(__dirname, '../../../supabase/migrations');

function readMigration(suffix: RegExp, label: string) {
  const matches = readdirSync(migrationsDir).filter((filename) => suffix.test(filename));

  expect(matches, `expected exactly one ${label} migration`).toHaveLength(1);
  expect(Number(matches[0].slice(0, 12))).toBeGreaterThan(202607081700);

  return readFileSync(path.join(migrationsDir, matches[0]), 'utf8');
}

function readCoreMigration() {
  return readMigration(/_pedidos_tarefas_core\.sql$/i, 'pedidos/tarefas core');
}

function readStorageMigration() {
  return readMigration(/_pedidos_anexos_storage\.sql$/i, 'pedidos attachment storage');
}

describe('pedidos/tarefas migration consistency', () => {
  it('creates the six approved legacy tables with organization ownership', () => {
    const sql = readCoreMigration();

    for (const table of [
      'pedidos',
      'tarefas',
      'subtarefas',
      'comentarios_tarefa',
      'atividades',
      'anexos',
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE public\\.${table}`, 'i'));
      expect(sql).toMatch(
        new RegExp(`CREATE TABLE public\\.${table}[\\s\\S]*?organization_id uuid NOT NULL`, 'i')
      );
      expect(sql).toMatch(
        new RegExp(`CONSTRAINT ${table}_org_id_uidx UNIQUE \\(organization_id, id\\)`, 'i')
      );
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'));
    }
  });

  it('preserves legacy checks and keeps tarefas.prazo nullable and deprecated', () => {
    const sql = readCoreMigration();

    expect(sql).toMatch(/prioridade IN \('Baixa', 'Normal', 'Alta'\)/i);
    expect(sql).toMatch(
      /status IN \('Ação Pendente', 'Aguardando Cliente', 'Prazo Concessionária', 'Concluído'\)/i
    );
    expect(sql).toMatch(/prazo timestamptz,/i);
    expect(sql).not.toMatch(/prazo timestamptz NOT NULL/i);
    expect(sql).toMatch(/COMMENT ON COLUMN public\.tarefas\.prazo IS '[^']*depreciad/i);
  });

  it('uses organization-scoped foreign keys for every parent relation', () => {
    const sql = readCoreMigration();

    for (const relation of [
      ['tarefas', 'pedido_id', 'pedidos'],
      ['atividades', 'pedido_id', 'pedidos'],
      ['anexos', 'pedido_id', 'pedidos'],
      ['subtarefas', 'tarefa_id', 'tarefas'],
      ['comentarios_tarefa', 'tarefa_id', 'tarefas'],
    ]) {
      const [table, column, parent] = relation;
      expect(sql).toMatch(
        new RegExp(
          `CREATE TABLE public\\.${table}[\\s\\S]*?FOREIGN KEY \\(organization_id, ${column}\\)[\\s\\S]*?REFERENCES public\\.${parent} \\(organization_id, id\\)`,
          'i'
        )
      );
    }

    expect(sql).toMatch(/CONSTRAINT anexos_pedido_org_fkey[\s\S]*ON DELETE RESTRICT/i);
  });

  it('adds optional MISFY customer, site and contact references without dropping legacy text', () => {
    const sql = readCoreMigration();

    expect(sql).toMatch(/cliente text NOT NULL/i);
    expect(sql).toMatch(/endereco text NOT NULL/i);
    expect(sql).toMatch(/cep text,/i);
    expect(sql).toMatch(/customer_id uuid,/i);
    expect(sql).toMatch(/site_id uuid,/i);
    expect(sql).toMatch(/contact_id uuid,/i);
    expect(sql).toMatch(/FOREIGN KEY \(organization_id, customer_id\)[\s\S]*REFERENCES public\.customers \(organization_id, id\)/i);
    expect(sql).toMatch(/FOREIGN KEY \(organization_id, site_id\)[\s\S]*REFERENCES public\.customer_sites \(organization_id, id\)/i);
    expect(sql).toMatch(/FOREIGN KEY \(organization_id, contact_id\)[\s\S]*REFERENCES public\.customer_contacts \(organization_id, id\)/i);
  });

  it('keeps human-readable responsibility fields and adds optional Auth references', () => {
    const sql = readCoreMigration();

    expect(sql).toMatch(/responsavel text,/i);
    expect(sql).toMatch(/usuario text NOT NULL/i);
    expect(sql).toMatch(/responsavel_user_id uuid REFERENCES auth\.users \(id\) ON DELETE SET NULL/i);
    expect(sql.match(/created_by uuid DEFAULT auth\.uid\(\) REFERENCES auth\.users \(id\) ON DELETE SET NULL/gi)).toHaveLength(4);
    expect(sql).toMatch(/user_id uuid DEFAULT auth\.uid\(\) REFERENCES auth\.users \(id\) ON DELETE SET NULL/i);
  });

  it('uses membership RLS and minimum authenticated grants only', () => {
    const sql = readCoreMigration();

    expect(sql).toMatch(/public\.is_organization_member\(organization_id\)/i);
    expect(sql).toMatch(/REVOKE ALL ON public\.pedidos, public\.tarefas, public\.subtarefas, public\.comentarios_tarefa, public\.atividades, public\.anexos FROM PUBLIC/i);
    expect(sql).toMatch(/REVOKE ALL ON public\.pedidos, public\.tarefas, public\.subtarefas, public\.comentarios_tarefa, public\.atividades, public\.anexos FROM anon/i);
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON public\.pedidos, public\.tarefas, public\.subtarefas TO authenticated/i);
    expect(sql).toMatch(/GRANT SELECT, INSERT, DELETE ON public\.comentarios_tarefa, public\.atividades, public\.anexos TO authenticated/i);

    for (const table of ['pedidos', 'tarefas', 'subtarefas']) {
      for (const operation of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        expect(sql).toMatch(
          new RegExp(`CREATE POLICY "${table} ${operation.toLowerCase()} by organization members"[\\s\\S]*?FOR ${operation}[\\s\\S]*?TO authenticated`, 'i')
        );
      }
    }

    for (const table of ['comentarios_tarefa', 'atividades', 'anexos']) {
      for (const operation of ['SELECT', 'INSERT', 'DELETE']) {
        expect(sql).toMatch(
          new RegExp(`CREATE POLICY "${table} ${operation.toLowerCase()} by organization members"[\\s\\S]*?FOR ${operation}[\\s\\S]*?TO authenticated`, 'i')
        );
      }
      expect(sql).not.toMatch(new RegExp(`CREATE POLICY "${table} update`, 'i'));
    }
  });

  it('creates private attachment storage with exact organization/order paths', () => {
    const sql = readStorageMigration();

    expect(sql).toMatch(/INSERT INTO storage\.buckets/i);
    expect(sql).toMatch(/'anexos-pedidos'/i);
    expect(sql).toMatch(/public,\s*file_size_limit/i);
    expect(sql).toMatch(/false,\s*10485760/i);
    expect(sql.match(/array_length\(storage\.foldername\(name\), 1\) = 2/gi)).toHaveLength(3);
    expect(sql).not.toMatch(/array_length\(storage\.foldername\(name\), 1\) (?:>=|>) 2/i);
    expect(sql).toMatch(/pedido\.organization_id::text = \(storage\.foldername\(name\)\)\[1\]/i);
    expect(sql).toMatch(/pedido\.id::text = \(storage\.foldername\(name\)\)\[2\]/i);
    expect(sql).toMatch(/CREATE POLICY "Order attachments storage read by organization members"[\s\S]*FOR SELECT[\s\S]*TO authenticated/i);
    expect(sql).toMatch(/CREATE POLICY "Order attachments storage insert by organization members"[\s\S]*FOR INSERT[\s\S]*TO authenticated/i);
    expect(sql).toMatch(/CREATE POLICY "Order attachments storage delete by organization members"[\s\S]*FOR DELETE[\s\S]*TO authenticated/i);
    expect(sql).not.toMatch(/owner_id = auth\.uid\(\)::text/i);
    expect(sql).toMatch(/NOT EXISTS[\s\S]*FROM public\.anexos AS attachment/i);
    expect(sql).not.toMatch(/CREATE POLICY[^;]*FOR UPDATE/i);
  });

  it('contains none of the prohibited legacy or universal access patterns', () => {
    const sql = `${readCoreMigration()}\n${readStorageMigration()}`;

    expect(sql).not.toMatch(/service_role/i);
    expect(sql).not.toMatch(/iurqgskfuupslrghgtej/i);
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]*?TO anon/i);
    expect(sql).not.toMatch(/GRANT [^;]* TO anon/i);
    expect(sql).not.toMatch(/USING\s*\(\s*true\s*\)/i);
    expect(sql).not.toMatch(/WITH CHECK\s*\(\s*true\s*\)/i);
  });
});
