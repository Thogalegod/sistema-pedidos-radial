import { describe, expect, it } from 'vitest';
import {
  createCabinePrimaria,
  createDisjuntorCabine,
  createAterramentoCabine,
  createCaboMediaTensaoCabine,
  createChaveSeccionadoraCabine,
  createManutencaoPreventiva,
  createParaRaiosCabine,
  createSupabaseManutencaoPreventivaClient,
  createTcTpCabine,
  createTransformadorCabine,
  deleteCabinePrimaria,
  deleteManutencaoPreventiva,
  getFichaDisjuntor,
  getFichaDisjuntorById,
  getFichaComplementar,
  getFichaComplementarById,
  getFichaTransformadorById,
  getFichaTransformador,
  listDisjuntoresCabine,
  listEquipamentosComplementaresCabine,
  listManutencoesPreventivasByCabine,
  listCabineEquipamentos,
  listCabinesBySite,
  resolveSingleOrganizationId,
  saveFichaDisjuntor,
  saveFichaComplementar,
  saveFichaTransformador,
  type ManutencaoPreventivaClient,
} from './queries-mutations';
import type { CabineEquipamento } from './types';
const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000003';
const SITE_ID = '00000000-0000-4000-8000-000000000004';
const CABINE_ID = '00000000-0000-4000-8000-000000000005';
const EQUIPAMENTO_ID = '00000000-0000-4000-8000-000000000006';
const MANUTENCAO_ID = '00000000-0000-4000-8000-000000000007';
const FICHA_ID = '00000000-0000-4000-8000-000000000008';
const DISJUNTOR_ID = '00000000-0000-4000-8000-000000000009';
const FICHA_DISJUNTOR_ID = '00000000-0000-4000-8000-000000000010';
const FICHA_COMPLEMENTAR_ID = '00000000-0000-4000-8000-000000000011';
const CHAVE_SECCIONADORA_ID = '00000000-0000-4000-8000-000000000012';
const DELETE_SUPABASE_ERROR = { message: 'violação de chave estrangeira' };

class FakeClient implements ManutencaoPreventivaClient {
  readonly organizationId = ORGANIZATION_ID;
  insertedCabine: Parameters<ManutencaoPreventivaClient['insertCabinePrimaria']>[0] | null = null;
  insertedEquipamento: Parameters<ManutencaoPreventivaClient['insertCabineEquipamento']>[0] | null = null;
  insertedManutencao: Parameters<ManutencaoPreventivaClient['insertManutencaoPreventiva']>[0] | null = null;
  upsertedFicha: Parameters<ManutencaoPreventivaClient['upsertFichaTransformador']>[0] | null = null;
  upsertedFichaDisjuntor: Parameters<ManutencaoPreventivaClient['upsertFichaDisjuntor']>[0] | null = null;
  upsertedFichaComplementar: Parameters<ManutencaoPreventivaClient['upsertFichaComplementar']>[0] | null = null;
  deletedCabine: { organizationId: string; cabineId: string } | null = null;
  deletedManutencao: { organizationId: string; manutencaoId: string } | null = null;
  listedManutencoes = false;
  listedDisjuntores = false;
  loadedFichaById = false;
  loadedFichaDisjuntorById = false;

  async getCurrentOrganizationId() {
    return this.organizationId;
  }

  async listCabinesBySite(organizationId: string, siteId: string) {
    expect(organizationId).toBe(ORGANIZATION_ID);
    expect(siteId).toBe(SITE_ID);
    return [];
  }

  async insertCabinePrimaria(record: Parameters<ManutencaoPreventivaClient['insertCabinePrimaria']>[0]) {
    this.insertedCabine = record;
    return { id: CABINE_ID, created_by: USER_ID, created_at: 'now', updated_at: 'now', ...record };
  }

  async listCabineEquipamentos(organizationId: string, cabineId: string): Promise<CabineEquipamento[]> {
    expect(organizationId).toBe(ORGANIZATION_ID);
    expect(cabineId).toBe(CABINE_ID);
    return [
      {
        id: EQUIPAMENTO_ID,
        organization_id: ORGANIZATION_ID,
        cabine_id: CABINE_ID,
        tipo: 'transformador',
        tag: 'TR-01',
        descricao: null,
        fabricante: null,
        numero_serie: null,
        potencia_kva: 500,
        status: 'ativo',
        dados_tecnicos: {},
        created_by: USER_ID,
        created_at: 'now',
        updated_at: 'now',
      },
      {
        id: DISJUNTOR_ID,
        organization_id: ORGANIZATION_ID,
        cabine_id: CABINE_ID,
        tipo: 'disjuntor_15kv',
        tag: 'DJ-01',
        descricao: null,
        fabricante: null,
        numero_serie: null,
        potencia_kva: null,
        status: 'ativo',
        dados_tecnicos: {},
        created_by: USER_ID,
        created_at: 'now',
        updated_at: 'now',
      },
      {
        id: CHAVE_SECCIONADORA_ID,
        organization_id: ORGANIZATION_ID,
        cabine_id: CABINE_ID,
        tipo: 'chave_seccionadora',
        tag: 'CH-01',
        descricao: null,
        fabricante: null,
        numero_serie: null,
        potencia_kva: null,
        status: 'ativo',
        dados_tecnicos: {},
        created_by: USER_ID,
        created_at: 'now',
        updated_at: 'now',
      },
    ];
  }

  async insertCabineEquipamento(record: Parameters<ManutencaoPreventivaClient['insertCabineEquipamento']>[0]) {
    this.insertedEquipamento = record;
    return { id: EQUIPAMENTO_ID, created_by: USER_ID, created_at: 'now', updated_at: 'now', ...record };
  }

  async insertManutencaoPreventiva(record: Parameters<ManutencaoPreventivaClient['insertManutencaoPreventiva']>[0]) {
    this.insertedManutencao = record;
    return { id: MANUTENCAO_ID, created_by: USER_ID, created_at: 'now', updated_at: 'now', ...record };
  }

  async listManutencoesPreventivasByCabine(organizationId: string, cabineId: string) {
    expect(organizationId).toBe(ORGANIZATION_ID);
    expect(cabineId).toBe(CABINE_ID);
    this.listedManutencoes = true;
    return [];
  }

  async deleteManutencaoPreventiva(organizationId: string, manutencaoId: string) {
    this.deletedManutencao = { organizationId, manutencaoId };
  }

  async deleteCabinePrimaria(organizationId: string, cabineId: string) {
    this.deletedCabine = { organizationId, cabineId };
  }

  async upsertFichaTransformador(record: Parameters<ManutencaoPreventivaClient['upsertFichaTransformador']>[0]) {
    this.upsertedFicha = record;
    return { id: FICHA_ID, created_by: USER_ID, created_at: 'now', updated_at: 'now', ...record };
  }

  async upsertFichaDisjuntor(record: Parameters<ManutencaoPreventivaClient['upsertFichaDisjuntor']>[0]) {
    this.upsertedFichaDisjuntor = record;
    return { id: FICHA_DISJUNTOR_ID, created_by: USER_ID, created_at: 'now', updated_at: 'now', ...record };
  }

  async upsertFichaComplementar(record: Parameters<ManutencaoPreventivaClient['upsertFichaComplementar']>[0]) {
    this.upsertedFichaComplementar = record;
    return { id: FICHA_COMPLEMENTAR_ID, created_by: USER_ID, created_at: 'now', updated_at: 'now', ...record };
  }

  async getFichaTransformador(organizationId: string, manutencaoId: string, equipamentoId: string) {
    expect(organizationId).toBe(ORGANIZATION_ID);
    expect(manutencaoId).toBe(MANUTENCAO_ID);
    expect(equipamentoId).toBe(EQUIPAMENTO_ID);
    return null;
  }

  async getFichaTransformadorById(organizationId: string, fichaId: string) {
    expect(organizationId).toBe(ORGANIZATION_ID);
    expect(fichaId).toBe(FICHA_ID);
    this.loadedFichaById = true;
    return {
      id: FICHA_ID,
      organization_id: ORGANIZATION_ID,
      manutencao_id: MANUTENCAO_ID,
      equipamento_id: EQUIPAMENTO_ID,
      dados_ficha: { data: { tag: 'TR-01' } },
      created_by: USER_ID,
      created_at: 'now',
      updated_at: 'now',
    };
  }

  async getFichaDisjuntor(organizationId: string, manutencaoId: string, equipamentoId: string) {
    expect(organizationId).toBe(ORGANIZATION_ID);
    expect(manutencaoId).toBe(MANUTENCAO_ID);
    expect(equipamentoId).toBe(DISJUNTOR_ID);
    return null;
  }

  async getFichaDisjuntorById(organizationId: string, fichaId: string) {
    expect(organizationId).toBe(ORGANIZATION_ID);
    expect(fichaId).toBe(FICHA_DISJUNTOR_ID);
    this.loadedFichaDisjuntorById = true;
    return {
      id: FICHA_DISJUNTOR_ID,
      organization_id: ORGANIZATION_ID,
      manutencao_id: MANUTENCAO_ID,
      equipamento_id: DISJUNTOR_ID,
      dados_ficha: { data: { tag: 'DJ-01' } },
      created_by: USER_ID,
      created_at: 'now',
      updated_at: 'now',
    };
  }

  async getFichaComplementar(organizationId: string, tableName: string, manutencaoId: string, equipamentoId: string) {
    expect(organizationId).toBe(ORGANIZATION_ID);
    expect(tableName).toBe('manutencao_fichas_chave_seccionadora');
    expect(manutencaoId).toBe(MANUTENCAO_ID);
    expect(equipamentoId).toBe(CHAVE_SECCIONADORA_ID);
    return null;
  }

  async getFichaComplementarById(organizationId: string, tableName: string, fichaId: string) {
    expect(organizationId).toBe(ORGANIZATION_ID);
    expect(tableName).toBe('manutencao_fichas_chave_seccionadora');
    expect(fichaId).toBe(FICHA_COMPLEMENTAR_ID);
    return {
      id: FICHA_COMPLEMENTAR_ID,
      organization_id: ORGANIZATION_ID,
      manutencao_id: MANUTENCAO_ID,
      equipamento_id: CHAVE_SECCIONADORA_ID,
      dados_ficha: { data: { tag: 'CH-01' } },
      created_by: USER_ID,
      created_at: 'now',
      updated_at: 'now',
    };
  }

  async validateFichaComplementarIds(organizationId: string, tipo: string, manutencaoId: string, equipamentoId: string) {
    expect(organizationId).toBe(ORGANIZATION_ID);
    expect(tipo).toBe('chave_seccionadora');
    expect(manutencaoId).toBe(MANUTENCAO_ID);
    expect(equipamentoId).toBe(CHAVE_SECCIONADORA_ID);
    return true;
  }
}

function createDeleteScenarioClient(options: {
  tableName: 'cabines_primarias' | 'manutencoes_preventivas';
  recordId: string;
  count: number | null;
  error: { message: string } | null;
}) {
  const { tableName, recordId, count, error } = options;
  const eqCalls: Array<{ column: string; value: string }> = [];

  const client = createSupabaseManutencaoPreventivaClient({
    auth: {
      getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }),
    },
    from(requestedTable: string) {
      if (requestedTable === 'organization_members') {
        return {
          select(columns: string) {
            expect(columns).toBe('organization_id');

            return {
              eq(column: string, value: string) {
                expect(column).toBe('user_id');
                expect(value).toBe(USER_ID);
                return Promise.resolve({ data: [{ organization_id: ORGANIZATION_ID }], error: null });
              },
            };
          },
        };
      }

      expect(requestedTable).toBe(tableName);

      return {
        delete(deleteOptions: { count?: 'exact' }) {
          expect(deleteOptions).toEqual({ count: 'exact' });

          const recordMatcher = {
            eq(column: string, value: string) {
              eqCalls.push({ column, value });

              if (eqCalls.length === 1) {
                expect(eqCalls[0]).toEqual({ column: 'organization_id', value: ORGANIZATION_ID });
                return recordMatcher;
              }

              expect(eqCalls).toEqual([
                { column: 'organization_id', value: ORGANIZATION_ID },
                { column: 'id', value: recordId },
              ]);

              return Promise.resolve({ data: null, error, count });
            },
          };

          return {
            eq: recordMatcher.eq,
          };
        },
      };
    },
  } as never);

  return { client, eqCalls };
}

describe('manutencao preventiva queries and mutations', () => {
  it('builds organization-scoped records for the minimum workflow', async () => {
    const client = new FakeClient();

    await listCabinesBySite(client, SITE_ID);
    await createCabinePrimaria(client, {
      customer_id: CUSTOMER_ID,
      site_id: SITE_ID,
      nome: 'Cabine A',
      tipo: 'convencional',
    });
    await listCabineEquipamentos(client, CABINE_ID);
    await createTransformadorCabine(client, {
      cabine_id: CABINE_ID,
      tipo: 'transformador',
      tag: 'TR-01',
      potencia_kva: 500,
    });
    await createDisjuntorCabine(client, {
      cabine_id: CABINE_ID,
      tipo: 'disjuntor_15kv',
      tag: 'DJ-01',
      fabricante: 'Fabricante QA',
      dados_tecnicos: { tensao_nominal: '15 kV' },
    });
    await createManutencaoPreventiva(client, {
      cabine_id: CABINE_ID,
      ano_referencia: 2026,
      data_execucao: '2026-07-31',
    });
    await listManutencoesPreventivasByCabine(client, CABINE_ID);
    const disjuntores = await listDisjuntoresCabine(client, CABINE_ID);
    await saveFichaTransformador(client, {
      manutencao_id: MANUTENCAO_ID,
      equipamento_id: EQUIPAMENTO_ID,
      dados_ficha: { tag: 'TR-01' },
    });
    await saveFichaDisjuntor(client, {
      manutencao_id: MANUTENCAO_ID,
      equipamento_id: DISJUNTOR_ID,
      dados_ficha: { data: { tag: 'DJ-01' } },
    });
    await getFichaTransformador(client, MANUTENCAO_ID, EQUIPAMENTO_ID);
    await getFichaTransformadorById(client, FICHA_ID);
    await getFichaDisjuntor(client, MANUTENCAO_ID, DISJUNTOR_ID);
    await getFichaDisjuntorById(client, FICHA_DISJUNTOR_ID);
    await deleteManutencaoPreventiva(client, MANUTENCAO_ID);
    await deleteCabinePrimaria(client, CABINE_ID);

    expect(client.insertedCabine).toMatchObject({
      organization_id: ORGANIZATION_ID,
      customer_id: CUSTOMER_ID,
      site_id: SITE_ID,
      nome: 'Cabine A',
      tipo: 'convencional',
      status: 'ativa',
    });
    expect(client.insertedEquipamento).toMatchObject({
      organization_id: ORGANIZATION_ID,
      cabine_id: CABINE_ID,
      tipo: 'disjuntor_15kv',
      tag: 'DJ-01',
      status: 'ativo',
    });
    expect(disjuntores).toHaveLength(1);
    expect(disjuntores[0]).toMatchObject({ id: DISJUNTOR_ID, tipo: 'disjuntor_15kv' });
    expect(client.insertedManutencao).toMatchObject({
      organization_id: ORGANIZATION_ID,
      cabine_id: CABINE_ID,
      ano_referencia: 2026,
      status: 'rascunho',
    });
    expect(client.upsertedFicha).toMatchObject({
      organization_id: ORGANIZATION_ID,
      manutencao_id: MANUTENCAO_ID,
      equipamento_id: EQUIPAMENTO_ID,
      dados_ficha: { tag: 'TR-01' },
    });
    expect(client.upsertedFichaDisjuntor).toMatchObject({
      organization_id: ORGANIZATION_ID,
      manutencao_id: MANUTENCAO_ID,
      equipamento_id: DISJUNTOR_ID,
      dados_ficha: { data: { tag: 'DJ-01' } },
    });
    expect(client.insertedCabine).not.toHaveProperty('created_by');
    expect(client.insertedEquipamento).not.toHaveProperty('created_by');
    expect(client.insertedManutencao).not.toHaveProperty('created_by');
    expect(client.upsertedFicha).not.toHaveProperty('created_by');
    expect(client.upsertedFichaDisjuntor).not.toHaveProperty('created_by');
    expect(client.listedManutencoes).toBe(true);
    expect(client.loadedFichaById).toBe(true);
    expect(client.loadedFichaDisjuntorById).toBe(true);
    expect(client.deletedManutencao).toEqual({
      organizationId: ORGANIZATION_ID,
      manutencaoId: MANUTENCAO_ID,
    });
    expect(client.deletedCabine).toEqual({
      organizationId: ORGANIZATION_ID,
      cabineId: CABINE_ID,
    });
  });

  it.each([
    ['cabines_primarias', CABINE_ID, deleteCabinePrimaria, 'a cabine'],
    ['manutencoes_preventivas', MANUTENCAO_ID, deleteManutencaoPreventiva, 'a manutenção preventiva'],
  ] as const)('deletes exactly one %s only when count = 1', async (tableName, recordId, deleteFn, _label) => {
    const { client, eqCalls } = createDeleteScenarioClient({
      tableName,
      recordId,
      count: 1,
      error: null,
    });

    await expect(deleteFn(client, recordId)).resolves.toBeUndefined();
    expect(eqCalls).toEqual([
      { column: 'organization_id', value: ORGANIZATION_ID },
      { column: 'id', value: recordId },
    ]);
  });

  it.each([
    ['cabines_primarias', CABINE_ID, deleteCabinePrimaria, 'a cabine'],
    ['manutencoes_preventivas', MANUTENCAO_ID, deleteManutencaoPreventiva, 'a manutenção preventiva'],
  ] as const)('rejects %s deletion when count = 0', async (tableName, recordId, deleteFn, label) => {
    const { client } = createDeleteScenarioClient({
      tableName,
      recordId,
      count: 0,
      error: null,
    });

    await expect(deleteFn(client, recordId)).rejects.toThrow(
      new RegExp(`Não foi possível excluir ${label}: o registro não foi excluído ou o usuário não possui permissão`, 'i')
    );
  });

  it.each([
    ['cabines_primarias', CABINE_ID, deleteCabinePrimaria, 'a cabine'],
    ['manutencoes_preventivas', MANUTENCAO_ID, deleteManutencaoPreventiva, 'a manutenção preventiva'],
  ] as const)('rejects %s deletion when count = null', async (tableName, recordId, deleteFn, label) => {
    const { client } = createDeleteScenarioClient({
      tableName,
      recordId,
      count: null,
      error: null,
    });

    await expect(deleteFn(client, recordId)).rejects.toThrow(
      new RegExp(`Não foi possível excluir ${label}: o registro não foi excluído ou o usuário não possui permissão`, 'i')
    );
  });

  it.each([
    ['cabines_primarias', CABINE_ID, deleteCabinePrimaria, 'a cabine'],
    ['manutencoes_preventivas', MANUTENCAO_ID, deleteManutencaoPreventiva, 'a manutenção preventiva'],
  ] as const)('propagates Supabase and FK errors for %s deletion', async (tableName, recordId, deleteFn, label) => {
    const { client } = createDeleteScenarioClient({
      tableName,
      recordId,
      count: null,
      error: DELETE_SUPABASE_ERROR,
    });

    await expect(deleteFn(client, recordId)).rejects.toThrow(
      new RegExp(`Não foi possível excluir ${label}: ${DELETE_SUPABASE_ERROR.message}`, 'i')
    );
  });

  it('requires exactly one organization membership', () => {
    expect(resolveSingleOrganizationId([{ organization_id: ORGANIZATION_ID }])).toBe(ORGANIZATION_ID);
    expect(() => resolveSingleOrganizationId([])).toThrow('Usuário sem organização associada');
    expect(() => resolveSingleOrganizationId([
      { organization_id: ORGANIZATION_ID },
      { organization_id: '00000000-0000-4000-8000-000000000009' },
    ])).toThrow('selecione uma organização ativa');
  });

  it('keeps equipment creation helpers constrained to their ficha type', async () => {
    const client = new FakeClient();

    await expect(createTransformadorCabine(client, {
      cabine_id: CABINE_ID,
      tipo: 'disjuntor_15kv',
      tag: 'DJ-01',
    })).rejects.toThrow('Tipo de equipamento inválido para ficha de transformador');

    await expect(createDisjuntorCabine(client, {
      cabine_id: CABINE_ID,
      tipo: 'transformador',
      tag: 'TR-01',
    })).rejects.toThrow('Tipo de equipamento inválido para ficha de disjuntor');

    expect(client.insertedEquipamento).toBeNull();
  });

  it('creates, lists and saves the five remaining sheet types through controlled helpers', async () => {
    const client = new FakeClient();

    const helpers = [
      ['chave_seccionadora', createChaveSeccionadoraCabine],
      ['para_raios', createParaRaiosCabine],
      ['tc_tp', createTcTpCabine],
      ['cabo_media_tensao', createCaboMediaTensaoCabine],
      ['aterramento', createAterramentoCabine],
    ] as const;

    for (const [tipo, createEquipment] of helpers) {
      await createEquipment(client, {
        cabine_id: CABINE_ID,
        tipo,
        tag: `TAG-${tipo}`,
        dados_tecnicos: { modelo: 'Modelo QA' },
      });

      expect(client.insertedEquipamento).toMatchObject({
        organization_id: ORGANIZATION_ID,
        cabine_id: CABINE_ID,
        tipo,
        tag: `TAG-${tipo}`,
        dados_tecnicos: { modelo: 'Modelo QA' },
      });
    }

    await expect(
      createChaveSeccionadoraCabine(client, {
        cabine_id: CABINE_ID,
        tipo: 'para_raios',
        tag: 'PR-01',
      })
    ).rejects.toThrow('Tipo de equipamento inválido para ficha de chave seccionadora');

    expect(await listEquipamentosComplementaresCabine(client, CABINE_ID, 'chave_seccionadora')).toEqual([
      expect.objectContaining({ id: CHAVE_SECCIONADORA_ID, tipo: 'chave_seccionadora' }),
    ]);

    await saveFichaComplementar(client, 'manutencao_fichas_chave_seccionadora', {
      manutencao_id: MANUTENCAO_ID,
      equipamento_id: CHAVE_SECCIONADORA_ID,
      dados_ficha: { data: { tag: 'CH-01' } },
    });
    await getFichaComplementar(client, 'manutencao_fichas_chave_seccionadora', MANUTENCAO_ID, CHAVE_SECCIONADORA_ID);
    await getFichaComplementarById(client, 'manutencao_fichas_chave_seccionadora', FICHA_COMPLEMENTAR_ID);

    expect(client.upsertedFichaComplementar).toMatchObject({
      organization_id: ORGANIZATION_ID,
      tableName: 'manutencao_fichas_chave_seccionadora',
      manutencao_id: MANUTENCAO_ID,
      equipamento_id: CHAVE_SECCIONADORA_ID,
      dados_ficha: { data: { tag: 'CH-01' } },
    });
  });

  it('filters memberships by the authenticated user', async () => {
    const client = createSupabaseManutencaoPreventivaClient({
      auth: {
        getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }),
      },
      from(table: string) {
        expect(table).toBe('organization_members');
        return {
          select(columns: string) {
            expect(columns).toBe('organization_id');
            return {
              async eq(column: string, value: string) {
                expect(column).toBe('user_id');
                expect(value).toBe(USER_ID);
                return { data: [{ organization_id: ORGANIZATION_ID }], error: null };
              },
            };
          },
        };
      },
    } as never);

    await expect(client.getCurrentOrganizationId()).resolves.toBe(ORGANIZATION_ID);
  });

  it('creates a supabase-backed client with the expected surface', () => {
    const client = createSupabaseManutencaoPreventivaClient({} as never);

    expect(Object.keys(client).sort()).toEqual([
      'getCurrentOrganizationId',
      'getFichaComplementarById',
      'getFichaComplementar',
      'getFichaDisjuntorById',
      'getFichaDisjuntor',
      'getFichaTransformadorById',
      'getFichaTransformador',
      'deleteCabinePrimaria',
      'deleteManutencaoPreventiva',
      'insertCabineEquipamento',
      'insertCabinePrimaria',
      'insertManutencaoPreventiva',
      'listManutencoesPreventivasByCabine',
      'listCabineEquipamentos',
      'listCabinesBySite',
      'upsertFichaDisjuntor',
      'upsertFichaComplementar',
      'upsertFichaTransformador',
      'validateFichaComplementarIds',
    ].sort());
  });
});
