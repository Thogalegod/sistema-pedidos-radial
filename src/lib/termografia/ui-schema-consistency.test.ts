import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../../..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('termografia UI schema consistency', () => {
  const uiSources = [
    read('src/app/termografia/page.tsx'),
    read('src/app/termografia/nova/page.tsx'),
    read('src/app/termografia/[id]/page.tsx'),
    read('src/app/termografia/[id]/imprimir/page.tsx'),
  ].join('\n');

  it('uses the normalized Termografia action layer instead of JSONB point writes', () => {
    expect(uiSources).toMatch(/listTermografiaReports/);
    expect(uiSources).toMatch(/createTermografiaReport/);
    expect(uiSources).toMatch(/createTermografiaPoint/);
    expect(uiSources).toMatch(/loadTermografiaReport/);
    expect(uiSources).not.toMatch(/update\(\{\s*pontos:/);
    expect(uiSources).not.toMatch(/insert\(\{[\s\S]*pontos:/);
  });

  it('does not generate report numbering in the browser', () => {
    expect(uiSources).not.toMatch(/numeroRelatorio/);
    expect(uiSources).not.toMatch(/report_year|sequence_number/);
    expect(uiSources).not.toMatch(/select\('\*',\s*\{\s*count:\s*'exact'/);
  });

  it('uses private Termografia storage helpers and avoids legacy storage behavior', () => {
    expect(uiSources).toMatch(/uploadTermografiaPhoto/);
    expect(uiSources).toMatch(/createTermografiaSignedUrl/);
    expect(uiSources).not.toMatch(/uploadArquivo|getUrlArquivo/);
    expect(uiSources).not.toMatch(/documentos-cabine|iurqgskfuupslrghgtej|upsert:\s*true/i);
  });
});
