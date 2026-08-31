import { describe, expect, it } from 'vitest';
import {
  cabineEquipamentoDraftSchema,
  cabinePrimariaDraftSchema,
  manutencaoFichaDisjuntorDraftSchema,
  manutencaoFichaTransformadorDraftSchema,
  manutencaoPreventivaDraftSchema,
} from './schemas';

const CUSTOMER_ID = '00000000-0000-4000-8000-000000000001';
const SITE_ID = '00000000-0000-4000-8000-000000000002';
const CABINE_ID = '00000000-0000-4000-8000-000000000003';
const EQUIPAMENTO_ID = '00000000-0000-4000-8000-000000000004';
const MANUTENCAO_ID = '00000000-0000-4000-8000-000000000005';

describe('manutencao preventiva schemas', () => {
  it('normalizes the minimum cabine, transformer, maintenance and sheet payloads', () => {
    const cabine = cabinePrimariaDraftSchema.parse({
      customer_id: CUSTOMER_ID,
      site_id: SITE_ID,
      nome: ' Cabine principal ',
      identificacao: '',
      tipo: 'CONVENCIONAL',
      status: undefined,
      observacoes: '',
    });
    const equipamento = cabineEquipamentoDraftSchema.parse({
      cabine_id: CABINE_ID,
      tipo: 'TRANSFORMADOR',
      tag: ' TR-01 ',
      descricao: '',
      fabricante: '',
      numero_serie: '',
      potencia_kva: '500',
      status: undefined,
      dados_tecnicos: { tensao_bt: '380/220' },
    });
    const manutencao = manutencaoPreventivaDraftSchema.parse({
      cabine_id: CABINE_ID,
      ano_referencia: '2026',
      data_execucao: '2026-07-31',
      responsavel_nome: '',
      responsavel_crea: '',
      status: undefined,
      observacoes: '',
    });
    const ficha = manutencaoFichaTransformadorDraftSchema.parse({
      manutencao_id: MANUTENCAO_ID,
      equipamento_id: EQUIPAMENTO_ID,
      dados_ficha: { visualStatus: { Limpeza: 'C' } },
    });

    expect(cabine).toMatchObject({
      nome: 'Cabine principal',
      identificacao: null,
      tipo: 'convencional',
      status: 'ativa',
      observacoes: null,
    });
    expect(equipamento).toMatchObject({
      tipo: 'transformador',
      tag: 'TR-01',
      descricao: null,
      fabricante: null,
      numero_serie: null,
      potencia_kva: 500,
      status: 'ativo',
      dados_tecnicos: { tensao_bt: '380/220' },
    });
    expect(manutencao).toMatchObject({
      ano_referencia: 2026,
      responsavel_nome: null,
      responsavel_crea: null,
      status: 'rascunho',
      observacoes: null,
    });
    expect(ficha.dados_ficha).toEqual({ visualStatus: { Limpeza: 'C' } });
  });

  it('normalizes disjuntor equipment and sheet payloads', () => {
    const equipamento = cabineEquipamentoDraftSchema.parse({
      cabine_id: CABINE_ID,
      tipo: 'DISJUNTOR_15KV',
      tag: ' DJ-01 ',
      descricao: '',
      fabricante: ' Fabricante QA ',
      modelo: '',
      numero_serie: '',
      potencia_kva: '',
      status: undefined,
      dados_tecnicos: { tensao_nominal: '15 kV' },
    });
    const ficha = manutencaoFichaDisjuntorDraftSchema.parse({
      manutencao_id: MANUTENCAO_ID,
      equipamento_id: EQUIPAMENTO_ID,
      dados_ficha: { data: { tag: 'DJ-01' } },
    });

    expect(equipamento).toMatchObject({
      tipo: 'disjuntor_15kv',
      tag: 'DJ-01',
      fabricante: 'Fabricante QA',
      potencia_kva: null,
      status: 'ativo',
      dados_tecnicos: { tensao_nominal: '15 kV' },
    });
    expect(ficha.dados_ficha).toEqual({ data: { tag: 'DJ-01' } });
  });

  it('accepts the five remaining equipment types and their sheet payloads', () => {
    for (const tipo of [
      'chave_seccionadora',
      'para_raios',
      'tc_tp',
      'cabo_media_tensao',
      'aterramento',
    ]) {
      const equipamento = cabineEquipamentoDraftSchema.parse({
        cabine_id: CABINE_ID,
        tipo,
        tag: ' EQ-01 ',
        dados_tecnicos: { modelo: 'Modelo QA' },
      });

      expect(equipamento).toMatchObject({
        tipo,
        tag: 'EQ-01',
        status: 'ativo',
        dados_tecnicos: { modelo: 'Modelo QA' },
      });
    }
  });

  it('rejects non-transformer sheets and invalid maintenance years', () => {
    expect(() =>
      cabineEquipamentoDraftSchema.parse({
        cabine_id: CABINE_ID,
        tipo: 'disjuntor',
        tag: 'DJ-01',
        potencia_kva: null,
      })
    ).toThrow();

    expect(() =>
      manutencaoPreventivaDraftSchema.parse({
        cabine_id: CABINE_ID,
        ano_referencia: 1999,
        data_execucao: '2026-07-31',
      })
    ).toThrow();
  });

  it('rejects invalid UUIDs and invalid ISO dates', () => {
    expect(() =>
      cabinePrimariaDraftSchema.parse({
        customer_id: 'customer-1',
        site_id: SITE_ID,
        nome: 'Cabine principal',
      })
    ).toThrow();

    expect(() =>
      manutencaoPreventivaDraftSchema.parse({
        cabine_id: CABINE_ID,
        ano_referencia: 2026,
        data_execucao: '2026-02-30',
      })
    ).toThrow();
  });
});
