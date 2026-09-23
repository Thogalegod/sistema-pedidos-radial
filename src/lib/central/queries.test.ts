import { describe, expect, it, vi } from 'vitest';
import { loadCentralOperationalSnapshot, type CentralOperationalReadClient } from './queries';

const TODAY = '2026-09-22';

describe('loadCentralOperationalSnapshot', () => {
  it('loads candidate rows first and batches every related lookup by id', async () => {
    const client = makeClient();

    const snapshot = await loadCentralOperationalSnapshot(client, TODAY);

    expect(client.listDueTasks).toHaveBeenCalledWith('org-1', TODAY);
    expect(client.listOrdersByIds).toHaveBeenCalledWith('org-1', ['order-1']);
    expect(client.listRentalItemsByContractIds).toHaveBeenCalledWith('org-1', ['contract-1']);
    expect(client.listBillingCyclesByContractIds).toHaveBeenCalledWith('org-1', ['contract-1']);
    expect(client.listPaymentsByBillingIds).toHaveBeenCalledWith('org-1', ['billing-overdue']);
    expect(client.listContractsByIds).toHaveBeenCalledWith('org-1', ['contract-overdue']);
    expect(client.listCustomersByIds).toHaveBeenCalledWith('org-1', ['customer-1', 'customer-2']);
    expect(snapshot.summary).toEqual({
      overdueTasks: 1,
      tasksToday: 0,
      periodsToBill: 1,
      overdueBillings: 1,
    });
  });

  it('skips empty batch queries', async () => {
    const client = makeClient({ empty: true });

    const snapshot = await loadCentralOperationalSnapshot(client, TODAY);

    expect(client.listOrdersByIds).not.toHaveBeenCalled();
    expect(client.listRentalItemsByContractIds).not.toHaveBeenCalled();
    expect(client.listBillingCyclesByContractIds).not.toHaveBeenCalled();
    expect(client.listPaymentsByBillingIds).not.toHaveBeenCalled();
    expect(client.listContractsByIds).not.toHaveBeenCalled();
    expect(client.listCustomersByIds).not.toHaveBeenCalled();
    expect(snapshot.priorities).toEqual([]);
  });
});

function makeClient(options: { empty?: boolean } = {}): CentralOperationalReadClient & Record<string, ReturnType<typeof vi.fn>> {
  const empty = options.empty ?? false;
  return {
    getCurrentOrganizationId: vi.fn().mockResolvedValue('org-1'),
    listDueTasks: vi.fn().mockResolvedValue(empty ? [] : [
      { id: 'task-1', pedido_id: 'order-1', descricao: 'Revisar pedido', vencimento: '2026-09-21', concluido: false },
    ]),
    listRelevantRentalContracts: vi.fn().mockResolvedValue(empty ? [] : [
      { id: 'contract-1', internal_number: 'LOC-1', customer_id: 'customer-1', start_date: '2026-08-22', kind: 'rental', status: 'awaiting_return' },
    ]),
    listOverdueBillingCandidates: vi.fn().mockResolvedValue(empty ? [] : [
      { id: 'billing-overdue', contract_id: 'contract-overdue', sequence_number: 1, period_start: '2026-08-01', period_end: '2026-08-31', due_date: '2026-09-01', total_amount: '100000', status: 'issued' },
    ]),
    listOrdersByIds: vi.fn().mockResolvedValue([
      { id: 'order-1', numero_pedido: '42', projeto: 'Projeto', cliente: 'Cliente Pedido' },
    ]),
    listRentalItemsByContractIds: vi.fn().mockResolvedValue([
      { id: 'item-1', contract_id: 'contract-1', asset_id: 'asset-1', returned_at: null },
    ]),
    listBillingCyclesByContractIds: vi.fn().mockResolvedValue([
      { id: 'billing-period', contract_id: 'contract-1', sequence_number: 1, period_start: '2026-08-22', period_end: '2026-09-21', due_date: '2026-09-30', total_amount: '100000', status: 'issued' },
    ]),
    listPaymentsByBillingIds: vi.fn().mockResolvedValue([]),
    listContractsByIds: vi.fn().mockResolvedValue([
      { id: 'contract-overdue', internal_number: 'LOC-2', customer_id: 'customer-2', start_date: '2026-07-01', kind: 'rental', status: 'active' },
    ]),
    listCustomersByIds: vi.fn().mockResolvedValue([
      { id: 'customer-1', legal_name: 'Cliente Um' },
      { id: 'customer-2', legal_name: 'Cliente Dois' },
    ]),
  };
}
