import { describe, expect, it } from 'vitest';
import { getContractKindLabel, getContractStatusLabel } from './contract-presentation';

describe('contract presentation labels', () => {
  it.each([
    ['rental', 'Locação'],
    ['energy_management', 'Gestão de energia'],
    ['recurring_service', 'Serviço recorrente'],
    ['other', 'Outro'],
  ] as const)('presents kind %s as %s', (kind, expected) => {
    expect(getContractKindLabel(kind)).toBe(expected);
  });

  it.each([
    ['active', 'Ativa'],
    ['draft', 'Rascunho'],
    ['paused', 'Pausada'],
    ['closing_requested', 'Encerramento solicitado'],
    ['awaiting_return', 'Aguardando devolução'],
    ['inspection', 'Em vistoria'],
    ['closed', 'Encerrada'],
    ['cancelled', 'Cancelada'],
  ] as const)('presents status %s as %s', (status, expected) => {
    expect(getContractStatusLabel(status)).toBe(expected);
  });
});
