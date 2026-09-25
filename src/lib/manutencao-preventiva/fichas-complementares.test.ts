import { describe, expect, it } from 'vitest';
import {
  buildFichaComplementarSearchParams,
  calculateAterramentoMeasurementSummary,
  fichaComplementarDefinitions,
  normalizeFichaComplementarSnapshot,
} from './fichas-complementares';

describe('fichas complementares da manutencao preventiva', () => {
  it('declares the five approved equipment types with controlled table and route names', () => {
    expect(fichaComplementarDefinitions.map((definition) => definition.tipo)).toEqual([
      'chave_seccionadora',
      'para_raios',
      'tc_tp',
      'cabo_media_tensao',
      'aterramento',
    ]);
    expect(fichaComplementarDefinitions.map((definition) => definition.tableName)).toEqual([
      'manutencao_fichas_chave_seccionadora',
      'manutencao_fichas_para_raios',
      'manutencao_fichas_tc_tp',
      'manutencao_fichas_cabos_media_tensao',
      'manutencao_fichas_aterramento',
    ]);
    expect(fichaComplementarDefinitions.map((definition) => definition.routeSegment)).toEqual([
      'ficha-chave-seccionadora',
      'ficha-para-raios',
      'ficha-tc-tp',
      'ficha-cabos-media-tensao',
      'ficha-aterramento',
    ]);
  });

  it('normalizes only valid persisted data while preserving technical values as text', () => {
    const snapshot = normalizeFichaComplementarSnapshot({
      data: {
        tag: 'CH-01',
        correnteNominal: 630,
        ignored: { nested: true },
        empty: null,
      },
      inspectionStatus: {
        limpeza: 'C',
        contatos: 'INVALID',
        conexoes: 'N/A',
      },
      measurements: [
        { id: 'p1', ponto: 'Malha', valorOhms: '1,8', resultado: 'OK', observacao: 10 },
        { id: 'p2', ponto: '', valorOhms: 'texto', resultado: null },
        { id: '', ponto: 'sem id', valorOhms: '2.4' },
        'invalid',
      ],
    });

    expect(snapshot.data).toEqual({
      tag: 'CH-01',
      correnteNominal: '630',
      empty: '',
    });
    expect(snapshot.inspectionStatus).toEqual({
      limpeza: 'C',
      conexoes: 'N/A',
    });
    expect(snapshot.measurements).toEqual([
      { id: 'p1', ponto: 'Malha', valorOhms: '1,8', resultado: 'OK', observacao: '10' },
      { id: 'p2', ponto: '', valorOhms: 'texto', resultado: '', observacao: '' },
    ]);
  });

  it('calculates grounding min, max and average only from numeric measurements', () => {
    expect(calculateAterramentoMeasurementSummary([
      { id: 'p1', ponto: 'P1', valorOhms: '1,5', resultado: '', observacao: '' },
      { id: 'p2', ponto: 'P2', valorOhms: '2.5 ohms', resultado: '', observacao: '' },
      { id: 'p3', ponto: 'P3', valorOhms: 'sem leitura', resultado: '', observacao: '' },
    ])).toEqual({
      menorValorMedido: '1.50',
      maiorValorMedido: '2.50',
      valorMedio: '2.00',
    });
  });

  it('builds stable query params for direct reload and preview links', () => {
    expect(buildFichaComplementarSearchParams({
      manutencaoId: '00000000-0000-4000-8000-000000000007',
      equipamentoId: '00000000-0000-4000-8000-000000000006',
      fichaId: '00000000-0000-4000-8000-000000000008',
    })).toBe(
      'manutencaoId=00000000-0000-4000-8000-000000000007&equipamentoId=00000000-0000-4000-8000-000000000006&fichaId=00000000-0000-4000-8000-000000000008'
    );
  });

  it('rejects invalid ids before building ficha query params', () => {
    expect(() => buildFichaComplementarSearchParams({
      manutencaoId: 'manutencao-1',
      equipamentoId: '00000000-0000-4000-8000-000000000006',
    })).toThrow('manutencaoId inválido');

    expect(() => buildFichaComplementarSearchParams({
      manutencaoId: '00000000-0000-4000-8000-000000000007',
      equipamentoId: 'equipamento-1',
    })).toThrow('equipamentoId inválido');

    expect(() => buildFichaComplementarSearchParams({
      manutencaoId: '00000000-0000-4000-8000-000000000007',
      equipamentoId: '00000000-0000-4000-8000-000000000006',
      fichaId: 'ficha-1',
    })).toThrow('fichaId inválido');
  });
});
