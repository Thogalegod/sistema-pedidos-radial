import { describe, expect, it } from 'vitest';
import {
  buildFichaDisjuntorSearchParams,
  emptyFichaDisjuntorSnapshot,
  isValidFichaDisjuntorId,
  normalizeFichaDisjuntorSnapshot,
} from './ficha-disjuntor';

describe('ficha disjuntor persisted payload helpers', () => {
  it('keeps persisted data and inspection status when loading dados_ficha', () => {
    const snapshot = normalizeFichaDisjuntorSnapshot({
      data: {
        tag: 'DJ-01',
        fabricante: 'Fabricante QA',
        tensaoNominal: '15 kV',
        resistenciaIsolamento: '1000',
      },
      inspectionStatus: {
        limpeza: 'N/C',
        operacaoManual: 'C',
      },
    });

    expect(snapshot.data).toEqual({
      tag: 'DJ-01',
      fabricante: 'Fabricante QA',
      tensaoNominal: '15 kV',
      resistenciaIsolamento: '1000',
    });
    expect(snapshot.inspectionStatus).toEqual({
      limpeza: 'N/C',
      operacaoManual: 'C',
    });
  });

  it('falls back to an empty snapshot when persisted dados_ficha is not an object', () => {
    expect(normalizeFichaDisjuntorSnapshot(null)).toEqual(emptyFichaDisjuntorSnapshot);
  });

  it('keeps only safe persisted values when part of dados_ficha is malformed', () => {
    const snapshot = normalizeFichaDisjuntorSnapshot({
      data: {
        tag: 'DJ-01',
        correnteNominal: 630,
        ignored: { nested: true },
        empty: null,
      },
      inspectionStatus: {
        limpeza: 'C',
        contatos: 'INVALID',
        conexoes: 'N/A',
      },
    });

    expect(snapshot.data).toEqual({
      tag: 'DJ-01',
      correnteNominal: '630',
      empty: '',
    });
    expect(snapshot.inspectionStatus).toEqual({
      limpeza: 'C',
      conexoes: 'N/A',
    });
  });

  it('builds navigation query params with real persisted ids', () => {
    const params = buildFichaDisjuntorSearchParams({
      manutencaoId: '00000000-0000-4000-8000-000000000007',
      equipamentoId: '00000000-0000-4000-8000-000000000006',
      fichaId: '00000000-0000-4000-8000-000000000008',
    });

    expect(params).toBe(
      'manutencaoId=00000000-0000-4000-8000-000000000007&equipamentoId=00000000-0000-4000-8000-000000000006&fichaId=00000000-0000-4000-8000-000000000008'
    );
  });

  it('validates persisted id query parameters as UUIDs', () => {
    expect(isValidFichaDisjuntorId('00000000-0000-4000-8000-000000000008')).toBe(true);
    expect(isValidFichaDisjuntorId('not-a-uuid')).toBe(false);
    expect(isValidFichaDisjuntorId('')).toBe(false);
  });
});
