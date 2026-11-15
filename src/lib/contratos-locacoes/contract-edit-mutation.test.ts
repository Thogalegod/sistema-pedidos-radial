import { describe, expect, it, vi } from 'vitest';
import { buildContractEditInput, updateContractSafely } from './contract-edit';
import type { BillingCycle, Contract, RentalItem } from './types';

function makeContract(): Contract {
  return {
    id: 'contract-1', organization_id: 'org-1', internal_number: '8', kind: 'rental',
    contract_company: 'fontes', customer_id: 'customer-1', site_id: 'site-1', legacy_order_number: 'PED-8',
    transport_notes: null, has_remittance_invoice: false, remittance_invoice_number: null,
    remittance_invoice_issuer: null, remittance_invoice_amount: null, remittance_invoice_issue_date: null,
    start_date: '2026-08-01', end_date: null, recurrence_days: 30, pricing_model: 'fixed',
    base_amount: '300000', percentage_rate: null, status: 'active', pause_started_at: null,
    pause_reason: null, notes: null, created_at: '', updated_at: '',
  };
}

function makeItem(): RentalItem {
  return {
    id: 'item-1', organization_id: 'org-1', contract_id: 'contract-1', asset_id: null,
    description: 'Transformador', equipment_type: 'Transformador', capacity: '75 kVA',
    serial_number: '', internal_code: '', quantity: 1, unit_amount: '300000', status: 'rented',
    returned_at: null, future_inventory_item_id: null, created_at: '', updated_at: '',
  };
}

describe('updateContractSafely', () => {
  it('saves an order-only change without billing when the database returned unit cents as a number', async () => {
    const contract = makeContract();
    const runtimeItem = { ...makeItem(), unit_amount: 300000 } as unknown as RentalItem;
    const updateContract = vi.fn(async (_id: string, patch: Partial<Contract>) => ({ ...contract, ...patch }));
    const upsertRentalItems = vi.fn(async (items: RentalItem[]) => items);
    const client = {
      getCurrentOrganizationId: async () => 'org-1',
      getContractById: async () => contract,
      listRentalItemsByContractId: async () => [runtimeItem],
      listBillingCyclesByContractId: async () => [],
      updateContract,
      upsertRentalItems,
      deleteMissingRentalItems: vi.fn(async () => undefined),
    };
    const edit = buildContractEditInput(contract, [runtimeItem]);
    edit.legacy_order_number = '20260807';

    await expect(updateContractSafely(client, contract.id, edit)).resolves.toBeDefined();
    expect(upsertRentalItems).toHaveBeenCalledWith([
      expect.objectContaining({ unit_amount: '300000' }),
    ]);
  });

  it('updates only contract and current rental item records when a billing already exists', async () => {
    const contract = makeContract();
    const item = makeItem();
    const billing = { id: 'billing-1' } as BillingCycle;
    const updateContract = vi.fn(async (_id: string, patch: Partial<Contract>) => ({ ...contract, ...patch }));
    const upsertRentalItems = vi.fn(async (items: RentalItem[]) => items);
    const deleteMissingRentalItems = vi.fn(async () => undefined);
    const client = {
      getCurrentOrganizationId: async () => 'org-1',
      getContractById: async () => contract,
      listRentalItemsByContractId: async () => [item],
      listBillingCyclesByContractId: async () => [billing],
      updateContract,
      upsertRentalItems,
      deleteMissingRentalItems,
    };
    const edit = buildContractEditInput(contract, [item]);
    edit.transport_notes = 'Novo transporte';
    edit.items[0].unit_amount = '350000';

    const result = await updateContractSafely(client, contract.id, edit);

    expect(updateContract).toHaveBeenCalledWith('contract-1', expect.objectContaining({
      organization_id: 'org-1', transport_notes: 'Novo transporte', base_amount: '350000',
    }));
    expect(upsertRentalItems).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'item-1', unit_amount: '350000' }),
    ]);
    expect(deleteMissingRentalItems).toHaveBeenCalledWith('contract-1', ['item-1']);
    expect(result.contract.base_amount).toBe('350000');
    expect(result.items[0].unit_amount).toBe('350000');
  });

  it('validates forbidden billed changes before any write', async () => {
    const contract = makeContract();
    const item = makeItem();
    const updateContract = vi.fn();
    const upsertRentalItems = vi.fn();
    const client = {
      getCurrentOrganizationId: async () => 'org-1',
      getContractById: async () => contract,
      listRentalItemsByContractId: async () => [item],
      listBillingCyclesByContractId: async () => [{ id: 'billing-1' } as BillingCycle],
      updateContract,
      upsertRentalItems,
      deleteMissingRentalItems: vi.fn(),
    };
    const edit = buildContractEditInput(contract, [item]);
    edit.customer_id = 'customer-2';

    await expect(updateContractSafely(client, contract.id, edit)).rejects.toThrow(
      'Bloqueado porque esta locação já possui cobranças emitidas.'
    );
    expect(updateContract).not.toHaveBeenCalled();
    expect(upsertRentalItems).not.toHaveBeenCalled();
  });
});
