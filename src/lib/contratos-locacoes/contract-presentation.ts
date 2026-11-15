import type { ContractKind, ContractStatus } from './types';

const kindLabels: Record<ContractKind, string> = {
  rental: 'Locação',
  energy_management: 'Gestão de energia',
  recurring_service: 'Serviço recorrente',
  other: 'Outro',
};

const statusLabels: Record<ContractStatus, string> = {
  active: 'Ativa',
  draft: 'Rascunho',
  paused: 'Pausada',
  closing_requested: 'Encerramento solicitado',
  awaiting_return: 'Aguardando devolução',
  inspection: 'Em vistoria',
  closed: 'Encerrada',
  cancelled: 'Cancelada',
};

export function getContractKindLabel(kind: ContractKind) {
  return kindLabels[kind];
}

export function getContractStatusLabel(status: ContractStatus) {
  return statusLabels[status];
}
