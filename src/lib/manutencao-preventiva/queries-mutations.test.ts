import { describe, expect, it } from 'vitest';
import {
  createCabinePrimaria,
  createManutencaoPreventiva,
  createSupabaseManutencaoPreventivaClient,
  createTransformadorCabine,
  getFichaTransformadorById,
  getFichaTransformador,
  listManutencoesPreventivasByCabine,
  listCabineEquipamentos,
  listCabinesBySite,
  resolveSingleOrganizationId,
  saveFichaTransformador,
  type ManutencaoPreventivaClient,
} from './queries-mutations';
const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000003';
const SITE_ID = '00000000-0000-4000-8000-000000000004';
const CABINE_ID = '00000000-0000-4000-8000-000000000005';
const EQUIPAMENTO_ID = '00000000-0000-4000-8000-000000000006';
const MANUTENCAO_ID = '00000000-0000-4000-8000-000000000007';
const FICHA_ID = '00000000-0000-4000-8000-000000000008';

class FakeClient implements ManutencaoPreventivaClient {
  readonly organizationId = ORGANIZATION_ID;
  insertedCabine: Parameters<ManutencaoPreventivaClient['insertCabinePrimaria']>[0] | null = null;
  insertedEquipamento: Parameters<ManutencaoPreventivaClient['insertCabineEquipamento']>[0] | null = null;
  insertedManutencao: Parameters<ManutencaoPreventivaClient['insertManutencaoPreventiva']>[0] | null = null;
  upsertedFicha: Parameters<ManutencaoPreventivaClient['upsertFichaTransformador']>[0] | null = null;
  listedManutencoes = false;
  loadedFichaById = false;

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

  async listCabineEquipamentos(organizationId: string, cabineId: string) {
    expect(organizationId).toBe(ORGANIZATION_ID);
    expect(cabineId).toBe(CABINE_ID);
    return [];
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

  async upsertFichaTransformador(record: Parameters<ManutencaoPreventivaClient['upsertFichaTransformador']>[0]) {
    this.upsertedFicha = record;
    return { id: FICHA_ID, created_by: USER_ID, created_at: 'now', updated_at: 'now', ...record };
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
    await createManutencaoPreventiva(client, {
      cabine_id: CABINE_ID,
      ano_referencia: 2026,
      data_execucao: '2026-07-31',
    });
    await listManutencoesPreventivasByCabine(client, CABINE_ID);
    await saveFichaTransformador(client, {
      manutencao_id: MANUTENCAO_ID,
      equipamento_id: EQUIPAMENTO_ID,
      dados_ficha: { tag: 'TR-01' },
    });
    await getFichaTransformador(client, MANUTENCAO_ID, EQUIPAMENTO_ID);
    await getFichaTransformadorById(client, FICHA_ID);

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
      tipo: 'transformador',
      tag: 'TR-01',
      potencia_kva: 500,
      status: 'ativo',
    });
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
    expect(client.insertedCabine).not.toHaveProperty('created_by');
    expect(client.insertedEquipamento).not.toHaveProperty('created_by');
    expect(client.insertedManutencao).not.toHaveProperty('created_by');
    expect(client.upsertedFicha).not.toHaveProperty('created_by');
    expect(client.listedManutencoes).toBe(true);
    expect(client.loadedFichaById).toBe(true);
  });

  it('requires exactly one organization membership', () => {
    expect(resolveSingleOrganizationId([{ organization_id: ORGANIZATION_ID }])).toBe(ORGANIZATION_ID);
    expect(() => resolveSingleOrganizationId([])).toThrow('Usuário sem organização associada');
    expect(() => resolveSingleOrganizationId([
      { organization_id: ORGANIZATION_ID },
      { organization_id: '00000000-0000-4000-8000-000000000009' },
    ])).toThrow('selecione uma organização ativa');
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
      'getFichaTransformadorById',
      'getFichaTransformador',
      'insertCabineEquipamento',
      'insertCabinePrimaria',
      'insertManutencaoPreventiva',
      'listManutencoesPreventivasByCabine',
      'listCabineEquipamentos',
      'listCabinesBySite',
      'upsertFichaTransformador',
    ].sort());
  });
});
