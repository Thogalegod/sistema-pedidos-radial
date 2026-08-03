export type CabinePrimariaTipo = 'convencional' | 'simplificada';
export type CabinePrimariaStatus = 'ativa' | 'inativa';
export type CabineEquipamentoTipo = 'transformador' | 'disjuntor_15kv';
export type CabineEquipamentoStatus = 'ativo' | 'inativo';
export type ManutencaoPreventivaStatus = 'rascunho' | 'concluida' | 'cancelada';

export type JsonObject = Record<string, unknown>;

export interface CabinePrimaria {
  id: string;
  organization_id: string;
  customer_id: string;
  site_id: string;
  nome: string;
  identificacao: string | null;
  tipo: CabinePrimariaTipo;
  status: CabinePrimariaStatus;
  observacoes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CabineEquipamento {
  id: string;
  organization_id: string;
  cabine_id: string;
  tipo: CabineEquipamentoTipo;
  tag: string;
  descricao: string | null;
  fabricante: string | null;
  numero_serie: string | null;
  potencia_kva: number | null;
  status: CabineEquipamentoStatus;
  dados_tecnicos: JsonObject;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ManutencaoPreventiva {
  id: string;
  organization_id: string;
  cabine_id: string;
  ano_referencia: number;
  data_execucao: string;
  responsavel_nome: string | null;
  responsavel_crea: string | null;
  status: ManutencaoPreventivaStatus;
  observacoes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ManutencaoFichaTransformador {
  id: string;
  organization_id: string;
  manutencao_id: string;
  equipamento_id: string;
  dados_ficha: JsonObject;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ManutencaoFichaDisjuntor {
  id: string;
  organization_id: string;
  manutencao_id: string;
  equipamento_id: string;
  dados_ficha: JsonObject;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
