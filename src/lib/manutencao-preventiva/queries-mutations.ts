import type { SupabaseClient } from '@supabase/supabase-js';
import {
  cabineEquipamentoDraftSchema,
  cabinePrimariaDraftSchema,
  manutencaoFichaTransformadorDraftSchema,
  manutencaoPreventivaDraftSchema,
  type CabineEquipamentoDraftInput,
  type CabinePrimariaDraftInput,
  type ManutencaoFichaTransformadorDraftInput,
  type ManutencaoPreventivaDraftInput,
} from './schemas';
import type {
  CabineEquipamento,
  CabinePrimaria,
  ManutencaoFichaTransformador,
  ManutencaoPreventiva,
} from './types';

function ensureData<T>(data: T | null, error: { message: string } | null, message: string) {
  if (error) {
    throw new Error(`${message}: ${error.message}`);
  }

  if (data == null) {
    throw new Error(message);
  }

  return data;
}

type CabinePrimariaInsert = Omit<
  CabinePrimaria,
  'id' | 'created_by' | 'created_at' | 'updated_at'
>;
type CabineEquipamentoInsert = Omit<
  CabineEquipamento,
  'id' | 'created_by' | 'created_at' | 'updated_at'
>;
type ManutencaoPreventivaInsert = Omit<
  ManutencaoPreventiva,
  'id' | 'created_by' | 'created_at' | 'updated_at'
>;
type ManutencaoFichaTransformadorUpsert = Omit<
  ManutencaoFichaTransformador,
  'id' | 'created_by' | 'created_at' | 'updated_at'
>;

export function resolveSingleOrganizationId(
  memberships: Array<{ organization_id: string }>
) {
  if (memberships.length === 0) {
    throw new Error('Usuário sem organização associada');
  }

  if (memberships.length > 1) {
    throw new Error('Usuário associado a mais de uma organização; selecione uma organização ativa antes de continuar');
  }

  return memberships[0].organization_id;
}

export interface ManutencaoPreventivaClient {
  getCurrentOrganizationId(): Promise<string>;
  listCabinesBySite(organizationId: string, siteId: string): Promise<CabinePrimaria[]>;
  insertCabinePrimaria(record: CabinePrimariaInsert): Promise<CabinePrimaria>;
  listCabineEquipamentos(organizationId: string, cabineId: string): Promise<CabineEquipamento[]>;
  insertCabineEquipamento(record: CabineEquipamentoInsert): Promise<CabineEquipamento>;
  insertManutencaoPreventiva(record: ManutencaoPreventivaInsert): Promise<ManutencaoPreventiva>;
  listManutencoesPreventivasByCabine(organizationId: string, cabineId: string): Promise<ManutencaoPreventiva[]>;
  upsertFichaTransformador(record: ManutencaoFichaTransformadorUpsert): Promise<ManutencaoFichaTransformador>;
  getFichaTransformador(organizationId: string, manutencaoId: string, equipamentoId: string): Promise<ManutencaoFichaTransformador | null>;
  getFichaTransformadorById(organizationId: string, fichaId: string): Promise<ManutencaoFichaTransformador | null>;
}

export function createSupabaseManutencaoPreventivaClient(
  client: SupabaseClient
): ManutencaoPreventivaClient {
  return {
    async getCurrentOrganizationId() {
      const { data: userData, error: userError } = await client.auth.getUser();

      if (userError) {
        throw new Error(`Não foi possível identificar o usuário atual: ${userError.message}`);
      }

      const userId = userData.user?.id;
      if (!userId) {
        throw new Error('Usuário não autenticado');
      }

      const { data, error } = await client
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId);

      if (error) {
        throw new Error(`Não foi possível identificar as organizações do usuário: ${error.message}`);
      }

      return resolveSingleOrganizationId(
        (data ?? []) as Array<{ organization_id: string }>
      );
    },

    async listCabinesBySite(organizationId, siteId) {
      const { data, error } = await client
        .from('cabines_primarias')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('site_id', siteId)
        .order('nome', { ascending: true });

      return ensureData((data ?? []) as CabinePrimaria[] | null, error, 'Não foi possível listar cabines');
    },

    async insertCabinePrimaria(record) {
      const { data, error } = await client
        .from('cabines_primarias')
        .insert(record)
        .select('*')
        .single();

      return ensureData(data as CabinePrimaria | null, error, 'Não foi possível criar a cabine');
    },

    async listCabineEquipamentos(organizationId, cabineId) {
      const { data, error } = await client
        .from('cabine_equipamentos')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('cabine_id', cabineId)
        .order('tag', { ascending: true });

      return ensureData((data ?? []) as CabineEquipamento[] | null, error, 'Não foi possível listar equipamentos');
    },

    async insertCabineEquipamento(record) {
      const { data, error } = await client
        .from('cabine_equipamentos')
        .insert(record)
        .select('*')
        .single();

      return ensureData(data as CabineEquipamento | null, error, 'Não foi possível criar o equipamento');
    },

    async insertManutencaoPreventiva(record) {
      const { data, error } = await client
        .from('manutencoes_preventivas')
        .insert(record)
        .select('*')
        .single();

      return ensureData(data as ManutencaoPreventiva | null, error, 'Não foi possível criar a manutenção preventiva');
    },

    async listManutencoesPreventivasByCabine(organizationId, cabineId) {
      const { data, error } = await client
        .from('manutencoes_preventivas')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('cabine_id', cabineId)
        .order('ano_referencia', { ascending: false })
        .order('data_execucao', { ascending: false });

      return ensureData(
        (data ?? []) as ManutencaoPreventiva[] | null,
        error,
        'Não foi possível listar manutenções preventivas'
      );
    },

    async upsertFichaTransformador(record) {
      const { data, error } = await client
        .from('manutencao_fichas_transformador')
        .upsert(record, { onConflict: 'organization_id,manutencao_id,equipamento_id' })
        .select('*')
        .single();

      return ensureData(data as ManutencaoFichaTransformador | null, error, 'Não foi possível salvar a ficha do transformador');
    },

    async getFichaTransformador(organizationId, manutencaoId, equipamentoId) {
      const { data, error } = await client
        .from('manutencao_fichas_transformador')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('manutencao_id', manutencaoId)
        .eq('equipamento_id', equipamentoId)
        .maybeSingle();

      if (error) {
        throw new Error(`Não foi possível carregar a ficha do transformador: ${error.message}`);
      }

      return (data ?? null) as ManutencaoFichaTransformador | null;
    },

    async getFichaTransformadorById(organizationId, fichaId) {
      const { data, error } = await client
        .from('manutencao_fichas_transformador')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('id', fichaId)
        .maybeSingle();

      if (error) {
        throw new Error(`Não foi possível carregar a ficha do transformador: ${error.message}`);
      }

      return (data ?? null) as ManutencaoFichaTransformador | null;
    },
  };
}

export async function listCabinesBySite(
  client: ManutencaoPreventivaClient,
  siteId: string
) {
  const organizationId = await client.getCurrentOrganizationId();
  return client.listCabinesBySite(organizationId, siteId);
}

export async function createCabinePrimaria(
  client: ManutencaoPreventivaClient,
  rawPayload: CabinePrimariaDraftInput
) {
  const payload = cabinePrimariaDraftSchema.parse(rawPayload);
  const organizationId = await client.getCurrentOrganizationId();

  return client.insertCabinePrimaria({
    organization_id: organizationId,
    customer_id: payload.customer_id,
    site_id: payload.site_id,
    nome: payload.nome,
    identificacao: payload.identificacao,
    tipo: payload.tipo,
    status: payload.status,
    observacoes: payload.observacoes,
  });
}

export async function listCabineEquipamentos(
  client: ManutencaoPreventivaClient,
  cabineId: string
) {
  const organizationId = await client.getCurrentOrganizationId();
  return client.listCabineEquipamentos(organizationId, cabineId);
}

export async function createTransformadorCabine(
  client: ManutencaoPreventivaClient,
  rawPayload: CabineEquipamentoDraftInput
) {
  const payload = cabineEquipamentoDraftSchema.parse(rawPayload);
  const organizationId = await client.getCurrentOrganizationId();

  return client.insertCabineEquipamento({
    organization_id: organizationId,
    cabine_id: payload.cabine_id,
    tipo: payload.tipo,
    tag: payload.tag,
    descricao: payload.descricao,
    fabricante: payload.fabricante,
    numero_serie: payload.numero_serie,
    potencia_kva: payload.potencia_kva,
    status: payload.status,
    dados_tecnicos: payload.dados_tecnicos,
  });
}

export async function createManutencaoPreventiva(
  client: ManutencaoPreventivaClient,
  rawPayload: ManutencaoPreventivaDraftInput
) {
  const payload = manutencaoPreventivaDraftSchema.parse(rawPayload);
  const organizationId = await client.getCurrentOrganizationId();

  return client.insertManutencaoPreventiva({
    organization_id: organizationId,
    cabine_id: payload.cabine_id,
    ano_referencia: payload.ano_referencia,
    data_execucao: payload.data_execucao,
    responsavel_nome: payload.responsavel_nome,
    responsavel_crea: payload.responsavel_crea,
    status: payload.status,
    observacoes: payload.observacoes,
  });
}

export async function listManutencoesPreventivasByCabine(
  client: ManutencaoPreventivaClient,
  cabineId: string
) {
  const organizationId = await client.getCurrentOrganizationId();
  return client.listManutencoesPreventivasByCabine(organizationId, cabineId);
}

export async function saveFichaTransformador(
  client: ManutencaoPreventivaClient,
  rawPayload: ManutencaoFichaTransformadorDraftInput
) {
  const payload = manutencaoFichaTransformadorDraftSchema.parse(rawPayload);
  const organizationId = await client.getCurrentOrganizationId();

  return client.upsertFichaTransformador({
    organization_id: organizationId,
    manutencao_id: payload.manutencao_id,
    equipamento_id: payload.equipamento_id,
    dados_ficha: payload.dados_ficha,
  });
}

export async function getFichaTransformador(
  client: ManutencaoPreventivaClient,
  manutencaoId: string,
  equipamentoId: string
) {
  const organizationId = await client.getCurrentOrganizationId();
  return client.getFichaTransformador(organizationId, manutencaoId, equipamentoId);
}

export async function getFichaTransformadorById(
  client: ManutencaoPreventivaClient,
  fichaId: string
) {
  const organizationId = await client.getCurrentOrganizationId();
  return client.getFichaTransformadorById(organizationId, fichaId);
}
