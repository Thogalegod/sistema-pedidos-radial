import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('termografia_drafts_migration.sql', () => {
  const sql = readFileSync(resolve(process.cwd(), 'termografia_drafts_migration.sql'), 'utf8');

  it('define criação idempotente e serializa a numeração mensal global', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION criar_rascunho_termografia/i);
    expect(sql).toMatch(/SECURITY INVOKER/i);
    expect(sql).toMatch(/auth\.uid\(\)/i);
    expect(sql).toMatch(/pg_advisory_xact_lock/i);
    expect(sql).toMatch(/status\s*=\s*'rascunho'/i);
    expect(sql).toMatch(/MAX\s*\(/i);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS[^;]+numero_relatorio/i);
  });
});
