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

  it('confirms cancellation within the organization and rejects false success', () => {
    const source = read('src/app/cabine/actions.ts');
    const start = source.indexOf('export async function cancelarRelatorioCabine');
    const end = source.indexOf('export async function vincularArtCabine');
    const cancellation = source.slice(start, end);

    expect(cancellation).toMatch(/update\(\{ status: 'cancelado' \}\)/i);
    expect(cancellation).toMatch(/\.eq\('organization_id', organizationId\)/i);
    expect(cancellation).toMatch(/\.eq\('id', id\)/i);
    expect(cancellation).toMatch(/\.select\('id, status'\)[\s\S]*\.single\(\)/i);
    expect(cancellation).toMatch(/Não foi possível cancelar o relatório/i);
  });

  it('exposes visible cancel and delete actions wired to user feedback', () => {
    const source = read('src/app/cabine/page.tsx');

    expect(source).toMatch(/cancelCabineReportFromUi/i);
    expect(source).toMatch(/deleteCabineReportFromUi/i);
    expect(source).toMatch(/Cancelar relatório/i);
    expect(source).toMatch(/Excluir relatório/i);
    expect(source).toMatch(/toast\.success/i);
    expect(source).toMatch(/toast\.error/i);
    expect(source).toMatch(/setRelatorios\(current => current\.filter/i);
  });

  it('uses an accessible in-page confirmation instead of a browser-native dialog', () => {
    const source = read('src/app/cabine/page.tsx');

    expect(source).toMatch(/role="dialog"/i);
    expect(source).toMatch(/aria-modal="true"/i);
    expect(source).toMatch(/Confirmar cancelamento/i);
    expect(source).toMatch(/Confirmar exclusão/i);
    expect(source).not.toMatch(/window\.confirm/i);
  });

  it('confirms the database row was deleted before reporting Storage success', () => {
    const source = read('src/app/cabine/actions.ts');
    const start = source.indexOf('export async function deletarRelatorioCabine');
    const deletion = source.slice(start);

    expect(deletion).toMatch(/\.delete\(\)[\s\S]*\.eq\('organization_id', organizationId\)[\s\S]*\.eq\('id', id\)[\s\S]*\.select\('id'\)[\s\S]*\.single\(\)/i);
    expect(deletion).toMatch(/reportDeleted: true, storageDeleted: true/i);
    expect(deletion).toMatch(/reportDeleted: true,[\s\S]*storageDeleted: false,[\s\S]*objeto órfão/i);
  });
});
