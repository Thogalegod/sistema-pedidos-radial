import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createContract,
  pauseContract,
  reactivateContract,
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
  public upsertedItems: RentalItem[] = [];
  public readonly deletedItemCalls: Array<{ contractId: string; keepIds: string[] }> = [];
  public readonly callOrder: string[] = [];

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
    return {
      id: contractId,
      organization_id: this.organizationId,
      internal_number: '1',
      kind: 'rental' as const,
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
      start_date: '2026-07-06',
      end_date: null,
      recurrence_days: 30,
      pricing_model: 'fixed' as const,
      base_amount: '100000',
      percentage_rate: null,
      status: 'draft' as const,
      pause_started_at: null,
      pause_reason: null,
      notes: null,
      created_at: '2026-07-06T00:00:00.000Z',
      updated_at: '2026-07-06T00:00:00.000Z',
      ...patch,
    };
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
        description: 'Gerador C',
        unit_amount: '65000',
      }),
    ]);
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
});
