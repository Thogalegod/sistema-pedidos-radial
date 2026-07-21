import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = path.resolve(__dirname, '../../..');

function read(relativePath: string) {
  return readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

describe('Relatórios de Cabine frontend consistency', () => {
  it('scopes server actions to the authenticated organization', () => {
    const source = read('src/app/cabine/actions.ts');

    expect(source).toMatch(/getCurrentOrganizationId/i);
    expect(source).toMatch(/organization_id: organizationId/i);
    expect(source).toMatch(/return \{ numeroRelatorio, id: data\.id, organizationId \}/i);
    expect(source.match(/\.eq\('organization_id', organizationId\)/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it('creates the report before uploading and compensates attachment failures', () => {
    const source = read('src/app/cabine/nova/page.tsx');
    const createCall = source.indexOf('await criarRelatorioCabine(');
    const uploadCall = source.indexOf('await uploadAndAttachCabineArt(');

    expect(createCall).toBeGreaterThan(-1);
    expect(uploadCall).toBeGreaterThan(createCall);
    expect(source).toMatch(/attachDocument:[\s\S]*vincularArtCabine/i);
    expect(source).toMatch(/removeDocument:[\s\S]*storage[\s\S]*\.remove/i);
  });

  it('uses the approved storage path and signed URLs everywhere', () => {
    const files = [
      'src/app/cabine/actions.ts',
      'src/app/cabine/nova/page.tsx',
      'src/app/cabine/[id]/imprimir/page.tsx',
      'src/lib/cabine-calc.ts',
    ].map(read);
    const source = files.join('\n');

    expect(source).toMatch(/art_storage_path/i);
    expect(source).toMatch(/getCabineDocumentSignedUrl/i);
    expect(source).not.toMatch(/art_arquivo_url/i);
    expect(source).not.toMatch(/getPublicUrl/i);
  });

  it('loads list and print data within the current organization', () => {
    const listSource = read('src/app/cabine/page.tsx');
    const printSource = read('src/app/cabine/[id]/imprimir/page.tsx');

    expect(listSource).toMatch(/getCurrentOrganizationId/i);
    expect(listSource).toMatch(/\.eq\('organization_id', organizationId\)/i);
    expect(printSource).toMatch(/getCurrentOrganizationId/i);
    expect(printSource).toMatch(/\.eq\('organization_id', organizationId\)/i);
  });

  it('delegates deletion to the tested database-then-Storage workflow', () => {
    const source = read('src/app/cabine/actions.ts');

    expect(source).toMatch(/deleteCabineReportThenDocument/i);
    expect(source).toMatch(/select\('art_storage_path'\)/i);
    expect(source).toMatch(/deleteReport:[\s\S]*\.delete\(\)/i);
    expect(source).toMatch(/removeDocument:[\s\S]*storage[\s\S]*\.remove/i);
  });
});
