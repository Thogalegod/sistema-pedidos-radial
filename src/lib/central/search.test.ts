import { describe, expect, it, vi } from 'vitest';
import { searchCentral, type CentralSearchReadClient } from './search';

describe('Central global search', () => {
  it('does not query the tenant for fewer than two meaningful characters', async () => {
    const client = makeClient();
    await expect(searchCentral(client, ' a ')).resolves.toEqual({ tasks: [], orders: [], customers: [], contracts: [], billings: [] });
    expect(client.getCurrentOrganizationId).not.toHaveBeenCalled();
  });

  it('searches bounded tenant data and batches related contracts and customers', async () => {
    const client = makeClient();
    const result = await searchCentral(client, 'Acme');

    expect(client.searchOrders).toHaveBeenCalledWith('org-1', 'Acme', 5);
    expect(client.searchTasks).toHaveBeenCalledWith('org-1', 'Acme', 5);
    expect(client.searchCustomers).toHaveBeenCalledWith('org-1', 'Acme', 5);
    expect(client.searchContracts).toHaveBeenCalledWith('org-1', 'Acme', ['customer-1'], 5);
    expect(client.searchBillings).toHaveBeenCalledWith('org-1', 'Acme', ['contract-1'], 5);
    expect(client.listContractsByIds).toHaveBeenCalledWith('org-1', ['contract-2']);
    expect(client.listCustomersByIds).toHaveBeenCalledWith('org-1', ['customer-2']);
    expect(result.orders[0].href).toBe('/?pedido=order-1');
    expect(result.tasks).toEqual([
      { id: 'quick-1', title: 'Ligar para Acme', detail: 'Tarefa avulsa', href: '/?tarefa=quick-1' },
      { id: 'task-1', title: 'Revisar Acme', detail: 'Tarefa de Pedido', href: '/?pedido=order-1&tarefa=task-1' },
    ]);
    expect(result.customers[0].href).toBe('/contratos-locacoes/clientes/customer-1');
    expect(result.contracts[0].href).toBe('/contratos-locacoes/contratos/contract-1');
    expect(result.billings[0]).toMatchObject({ href: '/contratos-locacoes/contratos/contract-2', documentNumber: 'FAT-99' });
  });
});

function makeClient(): CentralSearchReadClient & Record<string, ReturnType<typeof vi.fn>> {
  return {
    getCurrentOrganizationId: vi.fn().mockResolvedValue('org-1'),
    searchTasks: vi.fn().mockResolvedValue([
      { id: 'quick-1', pedido_id: null, descricao: 'Ligar para Acme' },
      { id: 'task-1', pedido_id: 'order-1', descricao: 'Revisar Acme' },
    ]),
    searchOrders: vi.fn().mockResolvedValue([
      { id: 'order-1', numero_pedido: '42', projeto: 'Projeto Acme', cliente: 'Acme' },
    ]),
    searchCustomers: vi.fn().mockResolvedValue([
      { id: 'customer-1', legal_name: 'Acme Ltda', trade_name: 'Acme' },
    ]),
    searchContracts: vi.fn().mockResolvedValue([
      { id: 'contract-1', internal_number: '10', customer_id: 'customer-1' },
    ]),
    searchBillings: vi.fn().mockResolvedValue([
      { id: 'billing-1', contract_id: 'contract-2', document_number: 'FAT-99', period_start: '2026-08-01', period_end: '2026-08-31', total_amount: '100000' },
    ]),
    listContractsByIds: vi.fn().mockResolvedValue([
      { id: 'contract-2', internal_number: '11', customer_id: 'customer-2' },
    ]),
    listCustomersByIds: vi.fn().mockResolvedValue([
      { id: 'customer-2', legal_name: 'Cliente Dois', trade_name: 'Cliente 2' },
    ]),
  };
}
