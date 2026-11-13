import { describe, expect, it } from 'vitest';
import { mapTermografiaReport } from './report-actions';
import { createFieldPoint, pointMetadata } from './field-collection';
import { buildPrintReport, formatReportTemperature } from './print-report';

function fixture() {
  const point = createFieldPoint({ setor: 'CCM', local: 'Q01' });
  point.inspectionStatus = 'inspected';
  point.photoIds = ['d1', 'd2', 't1', 't2'].map(() => crypto.randomUUID());
  point.hotspots = [0, 1, 2].map((n) => ({ id: crypto.randomUUID(), photoId: point.photoIds[n === 2 ? 3 : 2], digitalPhotoId: point.photoIds[n === 2 ? 1 : 0], componente: `Componente ${n}`, temperatura: n === 2 ? '66.3' : '54,5', conclusao: '', descricao: 'Descrição' }));
  return mapTermografiaReport({ report: { cliente_nome: 'Teste', data_execucao: '2026-11-13' }, points: [
    { id: 'normal', setor: 'Sala', local: 'Q02', inspecionado: true, ocorrencia: false, temperatura: '28.1', ordem: 1 },
    { id: point.id, setor: point.setor, local: point.local, metadados_coleta: pointMetadata(point), ordem: 2 },
  ], files: point.photoIds.map((id, index) => ({ id, point_id: point.id, tipo: index < 2 ? 'digital' : 'termica', storage_path: id, file_name: `${id}.jpg` })) });
}

describe('reference thermography report', () => {
  it('puts occurrences first, counts multiple occurrences per measurement and preserves source order/data', () => {
    const report = fixture(), before = JSON.stringify(report);
    const model = buildPrintReport(report);
    expect(model.entries.map(e => e.point.local)).toEqual(['Q01', 'Q02']);
    expect(model.entries.map(e => e.occurrenceCount)).toEqual([3, 0]);
    expect(model.occurrenceCount).toBe(3);
    expect(model.entries[0].temperature).toBe('54,5 / 66,3');
    expect(JSON.stringify(report)).toBe(before);
  });
  it('keeps the correct digital/thermal links and every occurrence exactly once in photo sheets', () => {
    const model = buildPrintReport(fixture());
    const entry = model.entries[0];
    expect(entry.sheets).toHaveLength(2);
    expect(entry.sheets.map(s => s.occurrences.length)).toEqual([2, 1]);
    for (const sheet of entry.sheets) for (const h of sheet.occurrences) {
      expect(h.digitalPhotoId).toBe(sheet.digital?.id);
      expect(h.photoId).toBe(sheet.thermal?.id);
    }
    expect(new Set(entry.sheets.flatMap(s => [s.digital?.id, s.thermal?.id].filter(Boolean))).size).toBe(4);
  });
  it('retains old report occurrences, temperatures, classifications and missing-photo states', () => {
    const report = fixture(); report.pontos = [{ id: 'old', setor: 'Sala', local: 'Q antigo', inspecionado: true, ocorrencia: true, temperatura: '75.5', componente: 'Disjuntor', classificacao: 'Crítico', risco: 'Alto', conclusao: 'Corrigir conexão', fotoDigitalUrl: 'legacy.jpg' }];
    const entry = buildPrintReport(report).entries[0];
    expect(entry.occurrenceCount).toBe(1);
    expect(entry.occurrences[0]).toMatchObject({ temperatura: '75.5', componente: 'Disjuntor', classificacao: 'Crítico', conclusao: 'Corrigir conexão' });
    expect(entry.sheets[0].digital?.storagePath).toBe('legacy.jpg');
    expect(entry.sheets[0].thermal).toBeUndefined();
  });
  it('calculates actual page references for 60 measurements and multiple-photo continuations', () => {
    const report = fixture(); const normal = report.pontos[0];
    report.pontos.push(...Array.from({ length: 58 }, (_, n) => ({ ...normal, id: `normal-${n}` })));
    const model = buildPrintReport(report);
    expect(model.relationPages).toHaveLength(3);
    expect(model.entries[0].page).toBe(9);
    expect(model.entries[1].page).toBe(11);
    expect(model.conclusionPage).toBe(70);
    expect(model.signaturePage).toBe(model.referencePage + 3);
    expect(model.totalPages).toBe(model.signaturePage);
  });
  it('never treats inaccessible/no-load/visual-only records as normal thermal results', () => {
    const report = fixture();
    const point = createFieldPoint({ setor: 'Sala', local: 'Q sem carga' }); point.inspectionStatus = 'no-load';
    report.pontos = [{ id: point.id, setor: point.setor, local: point.local, inspecionado: false, ocorrencia: false, metadata: pointMetadata(point) }];
    const model = buildPrintReport(report);
    expect(model.entries[0].status).toBe('Sem carga');
    expect(model.normalThermalCount).toBe(0);
    expect(model.pendingEntries).toHaveLength(1);
    expect(model.entries[0].temperature).toBe('—');
    expect(formatReportTemperature('54.50 °C')).toBe('54,50');
  });
  it('preserves long, multiline field descriptions in paginated continuations', () => {
    const report = fixture();
    const point = report.pontos[1];
    const text = Array.from({ length: 100 }, (_, i) => `Observação ${i}: verificar conexão.\n`).join('');
    point.metadata!.hotspots[0].descricao = text;
    const model = buildPrintReport(report), entry = model.entries[0];
    const recovered = entry.details.flat().filter(d => d.heading.startsWith('Ocorrência 1')).map(d => d.text).join('');
    expect(recovered).toContain(text);
    expect(entry.details.length).toBeGreaterThan(1);
    expect(entry.details.every(page => page.length <= 3)).toBe(true);
    expect(model.entries[1].page).toBe(entry.page + entry.sheets.length + entry.details.length);
  });
});
