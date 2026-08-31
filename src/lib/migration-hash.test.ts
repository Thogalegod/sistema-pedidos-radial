import { describe, expect, it } from 'vitest';
import { migrationSha256, normalizeMigrationContent } from './migration-hash';

describe('migration hash normalization', () => {
  it('treats LF, CRLF and CR-only line endings as the same migration content', () => {
    const lf = 'CREATE TABLE example (\n  id uuid\n);\n';
    const crlf = 'CREATE TABLE example (\r\n  id uuid\r\n);\r\n';
    const cr = 'CREATE TABLE example (\r  id uuid\r);\r';

    expect(normalizeMigrationContent(crlf)).toBe(lf);
    expect(normalizeMigrationContent(cr)).toBe(lf);
    expect(migrationSha256(lf)).toBe(migrationSha256(crlf));
    expect(migrationSha256(lf)).toBe(migrationSha256(cr));
  });

  it('still changes the hash when the SQL content changes', () => {
    const baseSql = 'CREATE TABLE example (\n  id uuid\n);\n';
    const changedSql = 'CREATE TABLE example (\n  id uuid PRIMARY KEY\n);\n';

    expect(migrationSha256(changedSql)).not.toBe(migrationSha256(baseSql));
  });
});
