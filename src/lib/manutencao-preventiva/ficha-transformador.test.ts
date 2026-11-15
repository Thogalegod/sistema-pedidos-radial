import { describe, expect, it } from 'vitest';
import {
  buildFichaTransformadorSearchParams,
  emptyFichaTransformadorSnapshot,
  isValidFichaTransformadorId,
  normalizeFichaTransformadorSnapshot,
} from './ficha-transformador';

describe('ficha transformador persisted payload helpers', () => {
  it('keeps persisted snapshot arrays and records when loading dados_ficha', () => {
    const snapshot = normalizeFichaTransformadorSnapshot({
      data: { tag: 'TR-01', potencia: '500' },
      photos: { placa: 'data:image/png;base64,abc' },
      selectedTaps: ['13,8', '13,2'],
      visualItems: ['Placa de características'],
      visualStatus: { 'Placa de características': 'N/C' },
      insulationRows: [{ id: 'at-bt', position: 'A.T. / B.T.', voltage: '5 kVcc', current: '1000' }],
      occurrences: [{ id: '1', priority: 'Alta', text: 'Bucha danificada.' }],
      coolingType: 'Óleo isolante',
      ttrConnections: ['H2-H3 / X0-X3'],
      windingRows: [{ winding: 'H1', connection: 'H1-H3' }],
      oilRows: [{ test: 'Cor', method: 'NBR-14483', specified: '3 à 4', result: '3' }],
    });

    expect(snapshot.data).toEqual({ tag: 'TR-01', potencia: '500' });
    expect(snapshot.photos).toEqual({ placa: 'data:image/png;base64,abc' });
    expect(snapshot.selectedTaps).toEqual(['13,8', '13,2']);
    expect(snapshot.visualStatus).toEqual({ 'Placa de características': 'N/C' });
    expect(snapshot.insulationRows).toEqual([{ id: 'at-bt', position: 'A.T. / B.T.', voltage: '5 kVcc', current: '1000' }]);
    expect(snapshot.occurrences).toEqual([{ id: '1', priority: 'Alta', text: 'Bucha danificada.' }]);
    expect(snapshot.coolingType).toBe('Óleo isolante');
  });

  it('falls back to an empty snapshot when persisted dados_ficha is not an object', () => {
    expect(normalizeFichaTransformadorSnapshot(null)).toEqual(emptyFichaTransformadorSnapshot);
  });

  it('keeps valid persisted fields when only part of dados_ficha is malformed', () => {
    const snapshot = normalizeFichaTransformadorSnapshot({
      data: { tag: 'TR-01', potencia: 500, ignored: { nested: true }, empty: null },
      photos: { placa: 'data:image/png;base64,abc', ignored: ['bad'] },
      selectedTaps: ['13,8', 13800, '13,2'],
      visualItems: ['Placa de características', null],
      visualStatus: { Limpeza: 'C', Bucha: 'INVALID' },
      insulationRows: [
        { id: 'at-bt', position: 'A.T. / B.T.', voltage: '5 kVcc', current: '1000' },
        { id: 'bad', position: 'B.T. / Massa' },
      ],
      occurrences: [{ id: '1', priority: 'Alta', text: 'Bucha danificada.' }, { id: 'bad' }],
      coolingType: null,
      ttrConnections: 'bad',
      windingRows: [{ winding: 'H1', connection: 'H1-H3' }, null],
      oilRows: [{ test: 'Cor', method: 'NBR-14483', specified: '3 à 4', result: '3' }, { test: 'bad' }],
    });

    expect(snapshot.data).toEqual({ tag: 'TR-01', potencia: '500', empty: '' });
    expect(snapshot.photos).toEqual({ placa: 'data:image/png;base64,abc' });
    expect(snapshot.selectedTaps).toEqual(['13,8', '13,2']);
    expect(snapshot.visualItems).toEqual(['Placa de características']);
    expect(snapshot.visualStatus).toEqual({ Limpeza: 'C' });
    expect(snapshot.insulationRows).toEqual([
      { id: 'at-bt', position: 'A.T. / B.T.', voltage: '5 kVcc', current: '1000' },
    ]);
    expect(snapshot.occurrences).toEqual([{ id: '1', priority: 'Alta', text: 'Bucha danificada.' }]);
    expect(snapshot.coolingType).toBe('Óleo isolante');
    expect(snapshot.ttrConnections).toEqual([]);
    expect(snapshot.windingRows).toEqual([{ winding: 'H1', connection: 'H1-H3' }]);
    expect(snapshot.oilRows).toEqual([{ test: 'Cor', method: 'NBR-14483', specified: '3 à 4', result: '3' }]);
  });

  it('builds navigation query params with real persisted ids', () => {
    const params = buildFichaTransformadorSearchParams({
      manutencaoId: '00000000-0000-4000-8000-000000000007',
      equipamentoId: '00000000-0000-4000-8000-000000000006',
      fichaId: '00000000-0000-4000-8000-000000000008',
    });

    expect(params).toBe(
      'manutencaoId=00000000-0000-4000-8000-000000000007&equipamentoId=00000000-0000-4000-8000-000000000006&fichaId=00000000-0000-4000-8000-000000000008'
    );
  });

  it('validates persisted id query parameters as UUIDs', () => {
    expect(isValidFichaTransformadorId('00000000-0000-4000-8000-000000000008')).toBe(true);
    expect(isValidFichaTransformadorId('not-a-uuid')).toBe(false);
    expect(isValidFichaTransformadorId('')).toBe(false);
  });
});
