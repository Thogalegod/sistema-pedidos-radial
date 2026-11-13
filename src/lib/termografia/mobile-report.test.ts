import { describe, expect, it } from 'vitest';
import { createFieldPoint, pointMetadata } from './field-collection';
import { mapTermografiaReport } from './report-actions';
import { pontosAquecidosPorSetorLocal } from './types';

describe('mobile report mapping', () => {
  it('retains ordered files and every hotspot association while legacy photo fields remain available', () => {
    const p = createFieldPoint({ setor: 'A', local: 'Q' }); const a = crypto.randomUUID(); const b = crypto.randomUUID();
    p.photoIds = [b, a]; p.hotspots = [1, 2].map(n => ({ id: crypto.randomUUID(), photoId: b, componente: `F${n}`, temperatura: '60', conclusao: 'Verificar' }));
    const report = mapTermografiaReport({ report: { id: crypto.randomUUID(), mobile_sync_state: 'complete' }, points: [{ id: p.id, setor: p.setor, local: p.local, metadados_coleta: pointMetadata(p) }], files: [{ id: a, point_id: p.id, tipo: 'termica', storage_path: 'a' }, { id: b, point_id: p.id, tipo: 'termica', storage_path: 'b' }] });
    expect(report.pontos[0].arquivos?.map(f => f.id)).toEqual([b, a]);
    expect(report.pontos[0].metadata?.hotspots).toHaveLength(2);
    expect(pontosAquecidosPorSetorLocal(report.pontos)[0].pontosAquecidos).toBe(2);
  });
  it('rejects unknown versions and cross-image links recoverably instead of treating them as legacy', () => {
    const p = createFieldPoint(); const id = crypto.randomUUID(); p.photoIds = [id];
    const base = { report: {}, points: [{ id: p.id, metadados_coleta: { ...pointMetadata(p), version: 2 } }], files: [] };
    expect(() => mapTermografiaReport(base)).toThrow(/versão|metadados/i);
    p.hotspots = [{ id: crypto.randomUUID(), photoId: id, componente: 'F', temperatura: '60', conclusao: '' }];
    expect(() => mapTermografiaReport({ report: {}, points: [{ id: p.id, metadados_coleta: pointMetadata(p) }], files: [{ id, point_id: p.id, tipo: 'digital' }] })).toThrow(/referência|metadados/i);
  });
});
