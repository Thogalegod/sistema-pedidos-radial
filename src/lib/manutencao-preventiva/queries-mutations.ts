import type { SupabaseClient } from '@supabase/supabase-js';
import {
  cabineEquipamentoDraftSchema,
  cabinePrimariaDraftSchema,
  manutencaoFichaTransformadorDraftSchema,
  manutencaoFichaDisjuntorDraftSchema,
  manutencaoFichaComplementarDraftSchema,
  manutencaoPreventivaDraftSchema,
  type CabineEquipamentoDraftInput,
  type CabinePrimariaDraftInput,
  type ManutencaoFichaTransformadorDraftInput,
  type ManutencaoFichaDisjuntorDraftInput,
  type ManutencaoFichaComplementarDraftInput,
  type ManutencaoPreventivaDraftInput,
} from './schemas';
import type {
  FichaComplementarTableName,
  FichaComplementarTipo,
} from './fichas-complementares';
import type {
  CabineEquipamento,
  CabinePrimaria,
  ManutencaoFichaComplementar,
  ManutencaoFichaDisjuntor,
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
type ManutencaoFichaDisjuntorUpsert = Omit<
  ManutencaoFichaDisjuntor,
  'id' | 'created_by' | 'created_at' | 'updated_at'
>;
type ManutencaoFichaComplementarUpsert = Omit<
  ManutencaoFichaComplementar,
  'id' | 'created_by' | 'created_at' | 'updated_at'
> & { tableName: FichaComplementarTableName };

async function deleteExactlyOneById(
  client: SupabaseClient,
  tableName: 'cabines_primarias' | 'manutencoes_preventivas',
  organizationId: string,
  recordId: string,
  label: string
) {
  const { count, error } = await client
    .from(tableName)
    .delete({ count: 'exact' })
    .eq('organization_id', organizationId)
    .eq('id', recordId);

  if (error) {
    throw new Error(`Não foi possível excluir ${label}: ${error.message}`);
  }

  if (count !== 1) {
    throw new Error(`Não foi possível excluir ${label}: o registro não foi excluído ou o usuário não possui permissão.`);
  }
}

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
  deleteCabinePrimaria(organizationId: string, cabineId: string): Promise<void>;
  listCabineEquipamentos(organizationId: string, cabineId: string): Promise<CabineEquipamento[]>;
  insertCabineEquipamento(record: CabineEquipamentoInsert): Promise<CabineEquipamento>;
  insertManutencaoPreventiva(record: ManutencaoPreventivaInsert): Promise<ManutencaoPreventiva>;
  deleteManutencaoPreventiva(organizationId: string, manutencaoId: string): Promise<void>;
  listManutencoesPreventivasByCabine(organizationId: string, cabineId: string): Promise<ManutencaoPreventiva[]>;
  upsertFichaTransformador(record: ManutencaoFichaTransformadorUpsert): Promise<ManutencaoFichaTransformador>;
  getFichaTransformador(organizationId: string, manutencaoId: string, equipamentoId: string): Promise<ManutencaoFichaTransformador | null>;
  getFichaTransformadorById(organizationId: string, fichaId: string): Promise<ManutencaoFichaTransformador | null>;
  upsertFichaDisjuntor(record: ManutencaoFichaDisjuntorUpsert): Promise<ManutencaoFichaDisjuntor>;
  getFichaDisjuntor(organizationId: string, manutencaoId: string, equipamentoId: string): Promise<ManutencaoFichaDisjuntor | null>;
  getFichaDisjuntorById(organizationId: string, fichaId: string): Promise<ManutencaoFichaDisjuntor | null>;
  upsertFichaComplementar(record: ManutencaoFichaComplementarUpsert): Promise<ManutencaoFichaComplementar>;
  getFichaComplementar(organizationId: string, tableName: FichaComplementarTableName, manutencaoId: string, equipamentoId: string): Promise<ManutencaoFichaComplementar | null>;
  getFichaComplementarById(organizationId: string, tableName: FichaComplementarTableName, fichaId: string): Promise<ManutencaoFichaComplementar | null>;
  validateFichaComplementarIds(organizationId: string, tipo: FichaComplementarTipo, manutencaoId: string, equipamentoId: string): Promise<boolean>;
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

    async deleteCabinePrimaria(organizationId, cabineId) {
      await deleteExactlyOneById(client, 'cabines_primarias', organizationId, cabineId, 'a cabine');
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

    async deleteManutencaoPreventiva(organizationId, manutencaoId) {
      await deleteExactlyOneById(
        client,
        'manutencoes_preventivas',
        organizationId,
        manutencaoId,
        'a manutenção preventiva'
      );
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

    async upsertFichaDisjuntor(record) {
      const { data, error } = await client
        .from('manutencao_fichas_disjuntor')
        .upsert(record, { onConflict: 'organization_id,manutencao_id,equipamento_id' })
        .select('*')
        .single();

      return ensureData(data as ManutencaoFichaDisjuntor | null, error, 'Não foi possível salvar a ficha do disjuntor');
    },

    async getFichaDisjuntor(organizationId, manutencaoId, equipamentoId) {
      const { data, error } = await client
        .from('manutencao_fichas_disjuntor')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('manutencao_id', manutencaoId)
        .eq('equipamento_id', equipamentoId)
        .maybeSingle();

      if (error) {
        throw new Error(`Não foi possível carregar a ficha do disjuntor: ${error.message}`);
      }

      return (data ?? null) as ManutencaoFichaDisjuntor | null;
    },

    async getFichaDisjuntorById(organizationId, fichaId) {
      const { data, error } = await client
        .from('manutencao_fichas_disjuntor')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('id', fichaId)
        .maybeSingle();

      if (error) {
        throw new Error(`Não foi possível carregar a ficha do disjuntor: ${error.message}`);
      }

      return (data ?? null) as ManutencaoFichaDisjuntor | null;
    },

    async upsertFichaComplementar(record) {
      const { tableName, ...payload } = record;
      const { data, error } = await client
        .from(tableName)
        .upsert(payload, { onConflict: 'organization_id,manutencao_id,equipamento_id' })
        .select('*')
        .single();

      return ensureData(data as ManutencaoFichaComplementar | null, error, 'Não foi possível salvar a ficha');
    },

    async getFichaComplementar(organizationId, tableName, manutencaoId, equipamentoId) {
      const { data, error } = await client
        .from(tableName)
        .select('*')
        .eq('organization_id', organizationId)
        .eq('manutencao_id', manutencaoId)
        .eq('equipamento_id', equipamentoId)
        .maybeSingle();

      if (error) {
        throw new Error(`Não foi possível carregar a ficha: ${error.message}`);
      }

      return (data ?? null) as ManutencaoFichaComplementar | null;
    },

    async getFichaComplementarById(organizationId, tableName, fichaId) {
      const { data, error } = await client
        .from(tableName)
        .select('*')
        .eq('organization_id', organizationId)
        .eq('id', fichaId)
        .maybeSingle();

      if (error) {
        throw new Error(`Não foi possível carregar a ficha: ${error.message}`);
      }

      return (data ?? null) as ManutencaoFichaComplementar | null;
    },

    async validateFichaComplementarIds(organizationId, tipo, manutencaoId, equipamentoId) {
      const [{ data: maintenance, error: maintenanceError }, { data: equipment, error: equipmentError }] = await Promise.all([
        client
          .from('manutencoes_preventivas')
          .select('id,cabine_id')
          .eq('organization_id', organizationId)
          .eq('id', manutencaoId)
          .maybeSingle(),
        client
          .from('cabine_equipamentos')
          .select('id,cabine_id,tipo,status')
          .eq('organization_id', organizationId)
          .eq('id', equipamentoId)
          .maybeSingle(),
      ]);

      if (maintenanceError) {
        throw new Error(`Não foi possível validar a manutenção: ${maintenanceError.message}`);
      }

      if (equipmentError) {
        throw new Error(`Não foi possível validar o equipamento: ${equipmentError.message}`);
      }

      const maintenanceRecord = maintenance as { cabine_id?: string } | null;
      const equipmentRecord = equipment as { cabine_id?: string; tipo?: string; status?: string } | null;

      return Boolean(
        maintenanceRecord
        && equipmentRecord
        && equipmentRecord.tipo === tipo
        && equipmentRecord.status === 'ativo'
        && equipmentRecord.cabine_id === maintenanceRecord.cabine_id
      );
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

export async function deleteCabinePrimaria(
  client: ManutencaoPreventivaClient,
  cabineId: string
) {
  const organizationId = await client.getCurrentOrganizationId();
  await client.deleteCabinePrimaria(organizationId, cabineId);
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

  if (payload.tipo !== 'transformador') {
    throw new Error('Tipo de equipamento inválido para ficha de transformador');
  }

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

export async function createDisjuntorCabine(
  client: ManutencaoPreventivaClient,
  rawPayload: CabineEquipamentoDraftInput
) {
  const payload = cabineEquipamentoDraftSchema.parse(rawPayload);
  const organizationId = await client.getCurrentOrganizationId();

  if (payload.tipo !== 'disjuntor_15kv') {
    throw new Error('Tipo de equipamento inválido para ficha de disjuntor');
  }

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

async function createComplementaryEquipment(
  client: ManutencaoPreventivaClient,
  rawPayload: CabineEquipamentoDraftInput,
  expectedTipo: FichaComplementarTipo,
  label: string
) {
  const payload = cabineEquipamentoDraftSchema.parse(rawPayload);
  const organizationId = await client.getCurrentOrganizationId();

  if (payload.tipo !== expectedTipo) {
    throw new Error(`Tipo de equipamento inválido para ficha de ${label}`);
  }

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

export async function createChaveSeccionadoraCabine(
  client: ManutencaoPreventivaClient,
  rawPayload: CabineEquipamentoDraftInput
) {
  return createComplementaryEquipment(client, rawPayload, 'chave_seccionadora', 'chave seccionadora');
}

export async function createParaRaiosCabine(
  client: ManutencaoPreventivaClient,
  rawPayload: CabineEquipamentoDraftInput
) {
  return createComplementaryEquipment(client, rawPayload, 'para_raios', 'para-raios');
}

export async function createTcTpCabine(
  client: ManutencaoPreventivaClient,
  rawPayload: CabineEquipamentoDraftInput
) {
  return createComplementaryEquipment(client, rawPayload, 'tc_tp', 'TC/TP');
}

export async function createCaboMediaTensaoCabine(
  client: ManutencaoPreventivaClient,
  rawPayload: CabineEquipamentoDraftInput
) {
  return createComplementaryEquipment(client, rawPayload, 'cabo_media_tensao', 'cabos de média tensão');
}

export async function createAterramentoCabine(
  client: ManutencaoPreventivaClient,
  rawPayload: CabineEquipamentoDraftInput
) {
  return createComplementaryEquipment(client, rawPayload, 'aterramento', 'aterramento');
}

export async function listDisjuntoresCabine(
  client: ManutencaoPreventivaClient,
  cabineId: string
) {
  const equipamentos = await listCabineEquipamentos(client, cabineId);
  return equipamentos.filter((equipamento) => (
    equipamento.tipo === 'disjuntor_15kv' && equipamento.status === 'ativo'
  ));
}

export async function listEquipamentosComplementaresCabine(
  client: ManutencaoPreventivaClient,
  cabineId: string,
  tipo: FichaComplementarTipo
) {
  const equipamentos = await listCabineEquipamentos(client, cabineId);
  return equipamentos.filter((equipamento) => (
    equipamento.tipo === tipo && equipamento.status === 'ativo'
  ));
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

export async function deleteManutencaoPreventiva(
  client: ManutencaoPreventivaClient,
  manutencaoId: string
) {
  const organizationId = await client.getCurrentOrganizationId();
  await client.deleteManutencaoPreventiva(organizationId, manutencaoId);
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

export async function saveFichaDisjuntor(
  client: ManutencaoPreventivaClient,
  rawPayload: ManutencaoFichaDisjuntorDraftInput
) {
  const payload = manutencaoFichaDisjuntorDraftSchema.parse(rawPayload);
  const organizationId = await client.getCurrentOrganizationId();

  return client.upsertFichaDisjuntor({
    organization_id: organizationId,
    manutencao_id: payload.manutencao_id,
    equipamento_id: payload.equipamento_id,
    dados_ficha: payload.dados_ficha,
  });
}

export async function getFichaDisjuntor(
  client: ManutencaoPreventivaClient,
  manutencaoId: string,
  equipamentoId: string
) {
  const organizationId = await client.getCurrentOrganizationId();
  return client.getFichaDisjuntor(organizationId, manutencaoId, equipamentoId);
}

export async function getFichaDisjuntorById(
  client: ManutencaoPreventivaClient,
  fichaId: string
) {
  const organizationId = await client.getCurrentOrganizationId();
  return client.getFichaDisjuntorById(organizationId, fichaId);
}

export async function saveFichaComplementar(
  client: ManutencaoPreventivaClient,
  tableName: FichaComplementarTableName,
  rawPayload: ManutencaoFichaComplementarDraftInput
) {
  const payload = manutencaoFichaComplementarDraftSchema.parse(rawPayload);
  const organizationId = await client.getCurrentOrganizationId();

  return client.upsertFichaComplementar({
    tableName,
    organization_id: organizationId,
    manutencao_id: payload.manutencao_id,
    equipamento_id: payload.equipamento_id,
    dados_ficha: payload.dados_ficha,
  });
}

export async function getFichaComplementar(
  client: ManutencaoPreventivaClient,
  tableName: FichaComplementarTableName,
  manutencaoId: string,
  equipamentoId: string
) {
  const organizationId = await client.getCurrentOrganizationId();
  return client.getFichaComplementar(organizationId, tableName, manutencaoId, equipamentoId);
}

export async function getFichaComplementarById(
  client: ManutencaoPreventivaClient,
  tableName: FichaComplementarTableName,
  fichaId: string
) {
  const organizationId = await client.getCurrentOrganizationId();
  return client.getFichaComplementarById(organizationId, tableName, fichaId);
}

export async function validateFichaComplementarIds(
  client: ManutencaoPreventivaClient,
  tipo: FichaComplementarTipo,
  manutencaoId: string,
  equipamentoId: string
) {
  const organizationId = await client.getCurrentOrganizationId();
  return client.validateFichaComplementarIds(organizationId, tipo, manutencaoId, equipamentoId);
}
