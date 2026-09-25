import {
  calcularRelatorio,
  tensaoBtLabel,
  type TransformerInput,
  type TransformerOutput,
} from '../transformer-calc';

export type TransformadorStatus = 'gerado' | 'revisado' | 'emitido' | 'cancelado';

export type TransformadorInsertPayload = {
  organization_id: string;
  criado_por: string;
  cliente_nome: string;
  cliente_endereco: string;
  cliente_cidade: string;
  cliente_uf: string;
  cliente_cnpj?: string;
  cliente_ie?: string;
  observacoes?: string;
  fabricante?: string;
  numero_serie?: string;
  potencia_kva: number;
  tensao_at_nominal: number;
  tensao_bt: TransformerInput['tensaoBt'];
  tensao_bt_label: string;
  resfriamento: string;
  grupo_ligacao: string;
  tipo_oleo: string;
  procedencia_oleo: string;
  tap_despacho: number;
  taps: number[];
  responsavel_nome: string;
  responsavel_crea: string;
  data_relatorio: string;
  temperatura_c: number;
  umidade_relativa?: number;
  valores_calculados: TransformerOutput;
  status: TransformadorStatus;
  revised_from_id?: string;
};

export function buildTransformadorInsert(
  input: TransformerInput,
  context: { organizationId: string; userId: string; revisedFromId?: string }
): TransformadorInsertPayload {
  return {
    organization_id: context.organizationId,
    criado_por: context.userId,
    cliente_nome: input.clienteNome,
    cliente_endereco: input.clienteEndereco,
    cliente_cidade: input.clienteCidade,
    cliente_uf: input.clienteUf,
    cliente_cnpj: input.clienteCnpj || undefined,
    cliente_ie: input.clienteIe || undefined,
    observacoes: input.observacoes || undefined,
    fabricante: input.fabricante || undefined,
    numero_serie: input.numeroSerie || undefined,
    potencia_kva: input.potenciaKva,
    tensao_at_nominal: input.tensaoAtNominal,
    tensao_bt: input.tensaoBt,
    tensao_bt_label: tensaoBtLabel(input.tensaoBt),
    resfriamento: input.resfriamento ?? 'LN',
    grupo_ligacao: input.grupoLigacao ?? 'Subtrativa',
    tipo_oleo: input.tipoOleo ?? 'Mineral',
    procedencia_oleo: input.procedenciaOleo ?? 'BR',
    tap_despacho: input.tapDespacho,
    taps: input.taps,
    responsavel_nome: input.responsavelNome ?? 'Roberto Fontes Lopes',
    responsavel_crea: input.responsavelCrea ?? 'CREA 060.104.922.9',
    data_relatorio: input.dataRelatorio,
    temperatura_c: input.temperaturaC ?? 26,
    umidade_relativa: input.umidadeRelativa,
    valores_calculados: calcularRelatorio(input),
    status: 'gerado',
    revised_from_id: context.revisedFromId,
  };
}

export function buildTransformadorRevisionInput(
  input: TransformerInput,
  original: { originalId: string; originalNumber: string }
) {
  const observacoes = input.observacoes
    ? `${input.observacoes}\n(Revisão do relatório ${original.originalNumber})`
    : `Revisão do relatório ${original.originalNumber}`;

  return {
    input: { ...input, observacoes },
    revisedFromId: original.originalId,
  };
}

export function buildTransformadorSupersededUpdate(input: {
  replacementId: string;
  replacementNumber: string;
  originalObservations?: string | null;
}) {
  const observacoes = input.originalObservations
    ? `${input.originalObservations}\n(Substituído pelo relatório ${input.replacementNumber})`
    : `Substituído pelo relatório ${input.replacementNumber}`;

  return {
    status: 'revisado' as const,
    superseded_by_id: input.replacementId,
    observacoes,
  };
}
