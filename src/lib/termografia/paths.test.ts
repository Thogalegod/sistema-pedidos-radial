import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TERMOGRAFIA_DOCUMENT_BUCKET,
  buildTermografiaPhotoPath,
  buildTermografiaReportFolder,
} from './paths';

const organizationId = '0f4239ca-2266-4b2f-a0a3-767791053c46';
const reportId = '1080fd6e-c94e-4e38-80a6-a829f1d75641';
const pointId = '4fbe8712-5554-4726-a107-df48033401d4';

describe('termografia storage paths', () => {
  it('uses the private Termografia bucket', () => {
    expect(TERMOGRAFIA_DOCUMENT_BUCKET).toBe('termografia-docs');
  });

  it('builds the report folder from organization and report ids', () => {
    expect(buildTermografiaReportFolder(organizationId, reportId)).toBe(`${organizationId}/${reportId}`);
  });

  it('builds the thermal photo path for a point without upsert assumptions', () => {
    expect(buildTermografiaPhotoPath({
      organizationId,
      reportId,
      pointId,
      fileName: 'termica.jpg',
    })).toBe(`${organizationId}/${reportId}/${pointId}/termica.jpg`);
  });

  it('rejects nested file names', () => {
    expect(() =>
      buildTermografiaPhotoPath({
        organizationId,
        reportId,
        pointId,
        fileName: 'nested/termica.jpg',
      })
    ).toThrow('Nome de arquivo inválido');
  });

  it('keeps the helper free of legacy backend and upsert behavior', () => {
    const source = readFileSync(path.resolve(__dirname, 'paths.ts'), 'utf8');

    expect(source).not.toMatch(/iurqgskfuupslrghgtej|supabase\.co/i);
    expect(source).not.toMatch(/upsert:\s*true/i);
  });
});
