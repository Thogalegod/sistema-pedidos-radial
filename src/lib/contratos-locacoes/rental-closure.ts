import type { Contract, RentalItem } from './types';

export function getPendingPhysicalReturnItems(items: RentalItem[]) {
  return items.filter((item) => item.asset_id && !item.returned_at);
}

export function hasPendingPhysicalReturns(items: RentalItem[]) {
  return getPendingPhysicalReturnItems(items).length > 0;
}

export function assertCanCloseContract(items: RentalItem[]) {
  if (hasPendingPhysicalReturns(items)) {
    throw new Error('Nao e possivel encerrar a locacao com devolucao pendente de ativo fisico.');
  }
}

export function assertValidReturnDate(
  contract: Pick<Contract, 'start_date' | 'end_date'>,
  item: Pick<RentalItem, 'asset_id'>,
  returnedAt: string
) {
  if (!item.asset_id) {
    throw new Error('Apenas itens vinculados a ativo fisico registram devolucao individual.');
  }

  if (returnedAt < contract.start_date) {
    throw new Error('A data de devolucao nao pode ser anterior ao inicio da locacao.');
  }

  if (contract.end_date && returnedAt < contract.end_date) {
    throw new Error('A data de devolucao nao pode ser anterior ao termino efetivo da locacao.');
  }
}
