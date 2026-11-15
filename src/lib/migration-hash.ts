import { createHash } from 'node:crypto';

export function normalizeMigrationContent(content: string) {
  return content.replace(/\r\n?/g, '\n');
}

export function migrationSha256(content: string) {
  return createHash('sha256').update(normalizeMigrationContent(content)).digest('hex');
}
