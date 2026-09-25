import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeContract,
  createContract,
  pauseContract,
  reactivateContract,
  registerRentalItemReturn,
  startContractClosure,
  type ContractsLocacoesMutationClient,
} from './mutations';
import type { Contract, Customer, CustomerContact, CustomerSite, RentalItem } from './types';

afterEach(() => {
  vi.restoreAllMocks();
});

class FakeContractMutationClient implements ContractsLocacoesMutationClient {
  constructor(
    private readonly options: {
      failUpsertItems?: string;
    } = {}
  ) {}

  public readonly organizationId = 'org-1';
  public insertedContract: Omit<Contract, 'id' | 'created_at' | 'updated_at'> | null = null;
  public updatedContract: { contractId: string; patch: Partial<Contract> } | null = null;
  public updatedRentalItem: { itemId: string; patch: Partial<RentalItem> } | null = null;
  public upsertedItems: RentalItem[] = [];
  public readonly deletedItemCalls: Array<{ contractId: string; keepIds: string[] }> = [];
  public readonly callOrder: string[] = [];
  public contract: Contract = {
    id: 'contract-1',
    organization_id: 'org-1',
    internal_number: '1',
    kind: 'rental',
    customer_id: 'customer-1',
    site_id: 'site-1',
    legacy_order_number: null,
    contract_company: 'fontes',
    transport_notes: null,
    has_remittance_invoice: false,
    remittance_invoice_number: null,
    remittance_invoice_issuer: null,
    remittance_invoice_amount: null,
    remittance_invoice_issue_date: null,
    start_date: '2026-08-10',
    end_date: '2026-08-20',
    recurrence_days: 30,
    pricing_model: 'fixed',
    base_amount: '100000',
    percentage_rate: null,
    status: 'awaiting_return',
    pause_started_at: null,
    pause_reason: null,
    notes: null,
    created_at: '2026-08-10T00:00:00.000Z',
    updated_at: '2026-08-10T00:00:00.000Z',
  };
  public rentalItems: RentalItem[] = [];

  async getCurrentOrganizationId() {
    return this.organizationId;
  }

  async insertCustomer(record: Omit<Customer, 'id' | 'created_at' | 'updated_at'>): Promise<never> {
    void record;
    return Promise.reject(new Error('not used'));
  }

  async updateCustomer(customerId: string, patch: Partial<Customer>): Promise<never> {
    void customerId;
    void patch;
    return Promise.reject(new Error('not used'));
  }

  async upsertCustomerSites(records: CustomerSite[]): Promise<never> {
    void records;
    return Promise.reject(new Error('not used'));
  }

  async upsertCustomerContacts(records: CustomerContact[]): Promise<never> {
    void records;
    return Promise.reject(new Error('not used'));
  }

  async deleteMissingCustomerSites() {
    throw new Error('not used');
  }

  async deleteMissingCustomerContacts() {
    throw new Error('not used');
  }

  async insertContract(record: Omit<Contract, 'id' | 'created_at' | 'updated_at'>) {
    this.callOrder.push('insertContract');
    this.insertedContract = record;
    return {
      id: 'contract-1',
      created_at: '2026-07-06T00:00:00.000Z',
      updated_at: '2026-07-06T00:00:00.000Z',
      ...record,
    };
  }

  async updateContract(contractId: string, patch: Partial<Contract>): Promise<Contract> {
    this.callOrder.push('updateContract');
    this.updatedContract = { contractId, patch };
    this.contract = { ...this.contract, id: contractId, ...patch };
    return this.contract;
  }

  async getContractById(organizationId: string, contractId: string) {
    expect(organizationId).toBe(this.organizationId);
    expect(contractId).toBe(this.contract.id);
    return this.contract;
  }

  async listRentalItemsByContractId(organizationId: string, contractId: string) {
    expect(organizationId).toBe(this.organizationId);
    expect(contractId).toBe(this.contract.id);
    return this.rentalItems;
  }

  async getRentalItemById(organizationId: string, itemId: string) {
    expect(organizationId).toBe(this.organizationId);
    const item = this.rentalItems.find((entry) => entry.id === itemId);
    if (!item) {
      throw new Error('item not found');
    }
    return item;
  }

  async updateRentalItem(itemId: string, patch: Partial<RentalItem>) {
    this.callOrder.push('updateRentalItem');
    this.updatedRentalItem = { itemId, patch };
    const current = this.rentalItems.find((entry) => entry.id === itemId);
    if (!current) {
      throw new Error('item not found');
    }
    const updated = { ...current, ...patch };
    this.rentalItems = this.rentalItems.map((entry) => (entry.id === itemId ? updated : entry));
    return updated;
  }

  async upsertRentalItems(records: RentalItem[]) {
    this.callOrder.push('upsertRentalItems');
    if (this.options.failUpsertItems) {
      throw new Error(this.options.failUpsertItems);
    }

    this.upsertedItems = records;
    return records;
  }

  async deleteMissingRentalItems(contractId: string, keepIds: string[]) {
    this.callOrder.push('deleteMissingRentalItems');
    this.deletedItemCalls.push({ contractId, keepIds });
  }
}

function makePhysicalItem(overrides: Partial<RentalItem> = {}): RentalItem {
  return {
    id: 'item-1',
    organization_id: 'org-1',
    contract_id: 'contract-1',
    asset_id: 'asset-1',
    description: 'Gerador cadastrado',
    equipment_type: 'Gerador',
    capacity: '150 kVA',
    serial_number: 'SN-1',
    internal_code: 'RAD-1',
    quantity: 1,
    unit_amount: '65000',
    status: 'rented',
    returned_at: null,
    future_inventory_item_id: null,
    created_at: '2026-08-10T00:00:00.000Z',
    updated_at: '2026-08-10T00:00:00.000Z',
    ...overrides,
  };
}

describe('contract mutations', () => {
  it('creates a rental contract with generated UUIDs for temporary rental items', async () => {
    const client = new FakeContractMutationClient();
    const randomUuidSpy = vi.spyOn(globalThis.crypto, 'randomUUID');
    randomUuidSpy
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222');

    const result = await createContract(client, {
      kind: 'rental',
      contract_company: 'radial',
      customer_id: 'customer-1',
      site_id: 'site-1',
      legacy_order_number: 'OS-100',
      transport_notes: 'Entrega por transportadora X',
      has_remittance_invoice: true,
      remittance_invoice_number: 'NF-2026-001',
      remittance_invoice_issuer: 'Radial Energia LTDA',
      remittance_invoice_amount: '450000',
      remittance_invoice_issue_date: '2026-07-04',
      start_date: '2026-07-06',
      end_date: '',
      recurrence_days: 30,
      pricing_model: 'fixed',
      base_amount: '150000',
      percentage_rate: '',
      status: 'active',
      notes: '',
      items: [
        {
          id: 'item-_R_aatpesnel5rlb_-initial',
          asset_id: null,
          description: 'Gerador A',
          equipment_type: 'Gerador',
          capacity: '150 kVA',
          serial_number: '',
          internal_code: '',
          quantity: 1,
          unit_amount: '45000',
          status: 'rented',
          notes: '',
        },
        {
          id: 'item-local-2',
          asset_id: null,
          description: 'Gerador B',
          equipment_type: 'Gerador',
          capacity: '200 kVA',
          serial_number: '',
          internal_code: '',
          quantity: 2,
          unit_amount: '55000',
          status: 'rented',
          notes: '',
        },
      ],
    });

    expect(result.contract.id).toBe('contract-1');
    expect(client.insertedContract?.organization_id).toBe('org-1');
    expect((client.insertedContract as Record<string, unknown>)?.contract_company).toBe('radial');
    expect((client.insertedContract as Record<string, unknown>)?.transport_notes).toBe('Entrega por transportadora X');
    expect((client.insertedContract as Record<string, unknown>)?.has_remittance_invoice).toBe(true);
    expect((client.insertedContract as Record<string, unknown>)?.remittance_invoice_number).toBe('NF-2026-001');
    expect((client.insertedContract as Record<string, unknown>)?.remittance_invoice_issuer).toBe('Radial');
    expect((client.insertedContract as Record<string, unknown>)?.remittance_invoice_amount).toBe('450000');
    expect((client.insertedContract as Record<string, unknown>)?.remittance_invoice_issue_date).toBe('2026-07-04');
    expect(client.upsertedItems).toHaveLength(2);
    expect(client.upsertedItems[0].id).toBe('11111111-1111-4111-8111-111111111111');
    expect(client.upsertedItems[1].id).toBe('22222222-2222-4222-8222-222222222222');
    expect(client.upsertedItems[0].contract_id).toBe('contract-1');
    expect(client.upsertedItems[0].id).not.toContain('item-');
    expect(client.upsertedItems[1].id).not.toContain('item-');
    expect(client.deletedItemCalls).toEqual([
      {
        contractId: 'contract-1',
        keepIds: [
          '11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222',
        ],
      },
    ]);
    expect(client.callOrder).toEqual([
      'insertContract',
      'upsertRentalItems',
      'deleteMissingRentalItems',
    ]);
  });

  it('keeps persisted UUIDs and contract_id when creating rental items', async () => {
    const client = new FakeContractMutationClient();

    await createContract(client, {
      kind: 'rental',
      contract_company: 'fontes',
      customer_id: 'customer-1',
      site_id: 'site-1',
      legacy_order_number: 'OS-101',
      transport_notes: '',
      has_remittance_invoice: false,
      remittance_invoice_number: '',
      remittance_invoice_issuer: '',
      remittance_invoice_amount: '',
      remittance_invoice_issue_date: '',
      start_date: '2026-07-06',
      end_date: '',
      recurrence_days: 30,
      pricing_model: 'fixed',
      base_amount: '150000',
      percentage_rate: '',
      status: 'active',
      notes: '',
      items: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          asset_id: null,
          description: 'Gerador C',
          equipment_type: 'Gerador',
          capacity: '180 kVA',
          serial_number: '',
          internal_code: '',
          quantity: 1,
          unit_amount: '65000',
          status: 'rented',
          notes: '',
        },
      ],
    });

    expect(client.upsertedItems).toEqual([
      expect.objectContaining({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        organization_id: 'org-1',
        contract_id: 'contract-1',
        asset_id: null,
        description: 'Gerador C',
        unit_amount: '65000',
      }),
    ]);
  });

  it('persists selected physical asset ids and normalized quantity', async () => {
    const client = new FakeContractMutationClient();

    await createContract(client, {
      kind: 'rental',
      contract_company: 'fontes',
      customer_id: 'customer-1',
      site_id: 'site-1',
      legacy_order_number: 'OS-104',
      transport_notes: '',
      has_remittance_invoice: false,
      remittance_invoice_number: '',
      remittance_invoice_issuer: '',
      remittance_invoice_amount: '',
      remittance_invoice_issue_date: '',
      start_date: '2026-07-06',
      end_date: '',
      recurrence_days: 30,
      pricing_model: 'fixed',
      base_amount: '150000',
      percentage_rate: '',
      status: 'active',
      notes: '',
      items: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          asset_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          description: 'Gerador cadastrado',
          equipment_type: 'Gerador',
          capacity: '150 kVA',
          serial_number: 'SN-1',
          internal_code: 'RAD-1',
          quantity: 5,
          unit_amount: '65000',
          status: 'rented',
          notes: '',
        },
      ],
    });

    expect(client.upsertedItems).toEqual([
      expect.objectContaining({
        asset_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        quantity: 1,
      }),
    ]);
  });

  it('sends physical rental item records in deterministic asset lock order', async () => {
    const client = new FakeContractMutationClient();

    await createContract(client, {
      kind: 'rental',
      contract_company: 'fontes',
      customer_id: 'customer-1',
      site_id: 'site-1',
      legacy_order_number: 'OS-105',
      transport_notes: '',
      has_remittance_invoice: false,
      remittance_invoice_number: '',
      remittance_invoice_issuer: '',
      remittance_invoice_amount: '',
      remittance_invoice_issue_date: '',
      start_date: '2026-07-06',
      end_date: '',
      recurrence_days: 30,
      pricing_model: 'fixed',
      base_amount: '150000',
      percentage_rate: '',
      status: 'active',
      notes: '',
      items: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          asset_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          description: 'Gerador B depois',
          equipment_type: 'Gerador',
          capacity: '200 kVA',
          serial_number: 'SN-B2',
          internal_code: 'RAD-B2',
          quantity: 1,
          unit_amount: '65000',
          status: 'rented',
          notes: '',
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          asset_id: null,
          description: 'Item manual 1',
          equipment_type: 'Manual',
          capacity: '',
          serial_number: '',
          internal_code: '',
          quantity: 2,
          unit_amount: '15000',
          status: 'rented',
          notes: '',
        },
        {
          id: '44444444-4444-4444-8444-444444444444',
          asset_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          description: 'Gerador A',
          equipment_type: 'Gerador',
          capacity: '150 kVA',
          serial_number: 'SN-A',
          internal_code: 'RAD-A',
          quantity: 1,
          unit_amount: '55000',
          status: 'rented',
          notes: '',
        },
        {
          id: '11111111-1111-4111-8111-111111111111',
          asset_id: null,
          description: 'Item manual 2',
          equipment_type: 'Manual',
          capacity: '',
          serial_number: '',
          internal_code: '',
          quantity: 3,
          unit_amount: '25000',
          status: 'rented',
          notes: '',
        },
        {
          id: '11111111-1111-4111-8111-111111111112',
          asset_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          description: 'Gerador C',
          equipment_type: 'Gerador',
          capacity: '250 kVA',
          serial_number: 'SN-C',
          internal_code: 'RAD-C',
          quantity: 1,
          unit_amount: '75000',
          status: 'rented',
          notes: '',
        },
      ],
    });

    expect(client.upsertedItems.map((item) => item.id)).toEqual([
      '44444444-4444-4444-8444-444444444444',
      '33333333-3333-4333-8333-333333333333',
      '11111111-1111-4111-8111-111111111112',
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111',
    ]);
    expect(client.deletedItemCalls[0].keepIds).toEqual(client.upsertedItems.map((item) => item.id));
  });

  it('omits transport and remittance fields from non-rental contract payloads', async () => {
    const client = new FakeContractMutationClient();

    await createContract(client, {
      kind: 'energy_management',
      contract_company: 'radial',
      customer_id: 'customer-1',
      site_id: 'site-1',
      legacy_order_number: 'OS-103',
      transport_notes: 'Não deve sair no payload',
      has_remittance_invoice: true,
      remittance_invoice_number: 'NF-999',
      remittance_invoice_issuer: 'Fornecedor teste',
      remittance_invoice_amount: '9900',
      remittance_invoice_issue_date: '2026-07-06',
      start_date: '2026-07-06',
      end_date: '',
      recurrence_days: 30,
      pricing_model: 'fixed',
      base_amount: '150000',
      percentage_rate: '',
      status: 'draft',
      notes: '',
      items: [],
    });

    expect(client.insertedContract).toMatchObject({
      kind: 'energy_management',
      contract_company: 'radial',
      customer_id: 'customer-1',
      site_id: 'site-1',
    });
    expect(client.insertedContract).not.toHaveProperty('transport_notes');
    expect(client.insertedContract).not.toHaveProperty('has_remittance_invoice');
    expect(client.insertedContract).not.toHaveProperty('remittance_invoice_number');
    expect(client.insertedContract).not.toHaveProperty('remittance_invoice_issuer');
    expect(client.insertedContract).not.toHaveProperty('remittance_invoice_amount');
    expect(client.insertedContract).not.toHaveProperty('remittance_invoice_issue_date');
    expect(client.upsertedItems).toHaveLength(0);
  });

  it('surfaces rental item persistence failures without reporting false success', async () => {
    const client = new FakeContractMutationClient({
      failUpsertItems: 'Não foi possível salvar os itens da locação: invalid input syntax for type uuid',
    });
    const randomUuidSpy = vi.spyOn(globalThis.crypto, 'randomUUID');
    randomUuidSpy.mockReturnValueOnce('11111111-1111-4111-8111-111111111111');

    await expect(() =>
      createContract(client, {
      kind: 'rental',
      contract_company: 'fontes',
      customer_id: 'customer-1',
        site_id: 'site-1',
        legacy_order_number: 'OS-102',
        transport_notes: '',
        has_remittance_invoice: false,
        remittance_invoice_number: '',
        remittance_invoice_issuer: '',
        remittance_invoice_amount: '',
        remittance_invoice_issue_date: '',
        start_date: '2026-07-06',
        end_date: '',
        recurrence_days: 30,
        pricing_model: 'fixed',
        base_amount: '150000',
        percentage_rate: '',
        status: 'draft',
        notes: '',
        items: [
        {
          id: 'item-local-1',
          asset_id: null,
          description: 'Gerador D',
          equipment_type: 'Gerador',
          capacity: '180 kVA',
            serial_number: '',
            internal_code: '',
            quantity: 1,
            unit_amount: '65000',
            status: 'rented',
            notes: '',
          },
        ],
      })
    ).rejects.toThrow(/Não foi possível concluir o cadastro completo do contrato/i);

    expect(client.insertedContract?.organization_id).toBe('org-1');
    expect(client.upsertedItems).toEqual([]);
    expect(client.deletedItemCalls).toEqual([
      {
        contractId: 'contract-1',
        keepIds: [],
      },
    ]);
    expect(client.callOrder).toEqual([
      'insertContract',
      'upsertRentalItems',
      'deleteMissingRentalItems',
    ]);
  });

  it('pauses and reactivates without touching rental item history', async () => {
    const client = new FakeContractMutationClient();

    await pauseContract(client, 'contract-1', {
      pause_started_at: '2026-07-10',
      pause_reason: 'Cliente em obra parada',
    });

    expect(client.updatedContract?.contractId).toBe('contract-1');
    expect(client.updatedContract?.patch.status).toBe('paused');
    expect(client.updatedContract?.patch.pause_reason).toContain('obra parada');

    await reactivateContract(client, 'contract-1', {
      reactivated_at: '2026-07-20',
    });

    expect(client.updatedContract?.patch.status).toBe('active');
    expect(client.updatedContract?.patch.pause_started_at).toBeNull();
    expect(client.updatedContract?.patch.pause_reason).toBeNull();
    expect(client.upsertedItems).toHaveLength(0);
  });

  it.each(['closed', 'cancelled'] as const)(
    'does not pause contracts in final status %s',
    async (status) => {
      const client = new FakeContractMutationClient();
      client.contract = { ...client.contract, status };

      await expect(() =>
        pauseContract(client, 'contract-1', {
          pause_started_at: '2026-07-10',
          pause_reason: 'Tentativa invalida',
        })
      ).rejects.toThrow(/nao podem ser pausados/i);

      expect(client.updatedContract).toBeNull();
    }
  );

  it.each(['closed', 'cancelled'] as const)(
    'does not reactivate contracts in final status %s',
    async (status) => {
      const client = new FakeContractMutationClient();
      client.contract = { ...client.contract, status };

      await expect(() =>
        reactivateContract(client, 'contract-1', {
          reactivated_at: '2026-07-20',
        })
      ).rejects.toThrow(/nao podem ser reativados/i);

      expect(client.updatedContract).toBeNull();
    }
  );

  it('starts closure as awaiting_return when a physical asset is pending', async () => {
    const client = new FakeContractMutationClient();
    client.rentalItems = [makePhysicalItem({ returned_at: null })];

    await startContractClosure(client, 'contract-1', { end_date: '2026-08-20' });

    expect(client.updatedContract).toEqual({
      contractId: 'contract-1',
      patch: expect.objectContaining({
        organization_id: 'org-1',
        end_date: '2026-08-20',
        status: 'awaiting_return',
      }),
    });
  });

  it('closes immediately when closure starts without physical assets', async () => {
    const client = new FakeContractMutationClient();
    client.rentalItems = [makePhysicalItem({ asset_id: null, quantity: 3 })];

    await startContractClosure(client, 'contract-1', { end_date: '2026-08-20' });

    expect(client.updatedContract?.patch.status).toBe('closed');
  });

  it('persists returned_at and returned status for a physical rental item', async () => {
    const client = new FakeContractMutationClient();
    client.rentalItems = [makePhysicalItem()];

    await registerRentalItemReturn(client, 'contract-1', 'item-1', { returned_at: '2026-08-20' });

    expect(client.updatedRentalItem).toEqual({
      itemId: 'item-1',
      patch: expect.objectContaining({
        organization_id: 'org-1',
        returned_at: '2026-08-20',
        status: 'returned',
      }),
    });
  });

  it('does not close while a physical asset remains pending', async () => {
    const client = new FakeContractMutationClient();
    client.rentalItems = [makePhysicalItem({ returned_at: null })];

    await expect(() => closeContract(client, 'contract-1')).rejects.toThrow(/devolucao pendente/i);
  });

  it('does not close without an effective end_date', async () => {
    const client = new FakeContractMutationClient();
    client.contract = { ...client.contract, end_date: null };
    client.rentalItems = [makePhysicalItem({ status: 'returned', returned_at: '2026-08-20' })];

    await expect(() => closeContract(client, 'contract-1')).rejects.toThrow(/sem data efetiva de termino/i);

    expect(client.updatedContract).toBeNull();
  });

  it('closes when all physical assets were returned and preserves end_date', async () => {
    const client = new FakeContractMutationClient();
    client.rentalItems = [makePhysicalItem({ status: 'returned', returned_at: '2026-08-20' })];

    await closeContract(client, 'contract-1');

    expect(client.updatedContract?.patch).toMatchObject({
      organization_id: 'org-1',
      end_date: '2026-08-20',
      status: 'closed',
    });
  });
});
