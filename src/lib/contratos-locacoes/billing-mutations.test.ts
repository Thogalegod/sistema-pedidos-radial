import { describe, expect, it, vi } from 'vitest';
import {
  createBillingCycle,
  createSupabaseContractsLocacoesMutationClient,
  updateBillingCycleDetails,
  recordBillingPayment,
  type BillingCycleInsertRecord,
  type BillingCycleMutablePatch,
  type ContractsLocacoesMutationClient,
} from './mutations';
import type {
  BillingCycle,
  BillingLine,
  Contract,
  Customer,
  CustomerContact,
  CustomerSite,
  Payment,
  RentalItem,
} from './types';

class FakeBillingMutationClient implements ContractsLocacoesMutationClient {
  public readonly organizationId = 'org-1';
  public insertedBilling: BillingCycleInsertRecord | null = null;
  public upsertedBillingLines: BillingLine[] = [];
  public insertedPayment: Omit<Payment, 'id' | 'created_at' | 'updated_at'> | null = null;
  public updatedBillingStatus: { organizationId: string; billingCycleId: string; patch: BillingCycleMutablePatch } | null = null;
  public billingTotalAmount = '150000';
  public billingDueDate = '2026-07-31';
  public billingCycles: BillingCycle[] = [];
  public paymentsByBillingCycleId = new Map<string, Payment[]>();
  public contractEndDate: string | null = null;
  public contractStatus: Contract['status'] = 'active';

  async getCurrentOrganizationId() {
    return this.organizationId;
  }

  async insertCustomer(_record: Omit<Customer, 'id' | 'created_at' | 'updated_at'>): Promise<never> {
    return Promise.reject(new Error('not used'));
  }

  async updateCustomer(_customerId: string, _patch: Partial<Customer>): Promise<never> {
    return Promise.reject(new Error('not used'));
  }

  async upsertCustomerSites(_records: CustomerSite[]): Promise<never> {
    return Promise.reject(new Error('not used'));
  }

  async upsertCustomerContacts(_records: CustomerContact[]): Promise<never> {
    return Promise.reject(new Error('not used'));
  }

  async deleteMissingCustomerSites(): Promise<void> {
    throw new Error('not used');
  }

  async deleteMissingCustomerContacts(): Promise<void> {
    throw new Error('not used');
  }

  async insertContract(_record: Omit<Contract, 'id' | 'created_at' | 'updated_at'>): Promise<never> {
    return Promise.reject(new Error('not used'));
  }

  async getContractById(_organizationId: string, _contractId: string): Promise<Contract> {
    return {
      id: 'contract-1',
      organization_id: this.organizationId,
      internal_number: '23',
      kind: 'rental',
      contract_company: 'fontes',
      customer_id: 'customer-1',
      site_id: 'site-1',
      legacy_order_number: 'OS-2026-23',
      transport_notes: null,
      has_remittance_invoice: false,
      remittance_invoice_number: null,
      remittance_invoice_issuer: null,
      remittance_invoice_amount: null,
      remittance_invoice_issue_date: null,
      start_date: '2026-07-01',
      end_date: this.contractEndDate,
      recurrence_days: 30,
      pricing_model: 'fixed',
      base_amount: '150000',
      percentage_rate: null,
      status: this.contractStatus,
      pause_started_at: null,
      pause_reason: null,
      notes: null,
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    };
  }

  async updateContract(_contractId: string, _patch: Partial<Contract>): Promise<never> {
    return Promise.reject(new Error('not used'));
  }

  async upsertRentalItems(_records: RentalItem[]): Promise<never> {
    return Promise.reject(new Error('not used'));
  }

  async deleteMissingRentalItems(): Promise<void> {
    throw new Error('not used');
  }

  async insertBillingCycle(record: BillingCycleInsertRecord): Promise<BillingCycle> {
    this.insertedBilling = record;
    this.billingTotalAmount = record.total_amount;
    return {
      id: 'billing-1',
      created_at: '2026-07-06T00:00:00.000Z',
      updated_at: '2026-07-06T00:00:00.000Z',
      sent_at: null,
      needs_resend: false,
      content_revision: '0',
      boleto_change_pending: false,
      boleto_change_operation_id: null,
      boleto_change_started_at: null,
      ...record,
    };
  }

  async updateBillingCycle(organizationId: string, billingCycleId: string, patch: BillingCycleMutablePatch): Promise<BillingCycle> {
    this.updatedBillingStatus = { organizationId, billingCycleId, patch };
    return {
      id: billingCycleId,
      organization_id: this.organizationId,
      contract_id: 'contract-1',
      sequence_number: 1,
      period_start: '2026-07-01',
      period_end: '2026-07-30',
      issue_date: '2026-07-01',
      due_date: '2026-07-31',
      base_amount: '150000',
      discount_amount: '0',
      surcharge_amount: '0',
      exemption_amount: '0',
      total_amount: this.billingTotalAmount,
      document_type: 'receipt',
      document_number: 'R260701001',
      status: 'issued',
      sent_at: null,
      needs_resend: false,
      content_revision: '0',
      boleto_change_pending: false,
      boleto_change_operation_id: null,
      boleto_change_started_at: null,
      notes: null,
      created_at: '2026-07-06T00:00:00.000Z',
      updated_at: '2026-07-06T00:00:00.000Z',
      ...patch,
    };
  }

  async getBillingCycleById(_organizationId: string, billingCycleId: string): Promise<BillingCycle> {
    const existing = this.billingCycles.find((billing) => billing.id === billingCycleId);
    if (existing) {
      return existing;
    }

    return {
      id: billingCycleId,
      organization_id: this.organizationId,
      contract_id: 'contract-1',
      sequence_number: 1,
      period_start: '2026-07-01',
      period_end: '2026-07-30',
      issue_date: '2026-07-01',
      due_date: this.billingDueDate,
      base_amount: this.billingTotalAmount,
      discount_amount: '0',
      surcharge_amount: '0',
      exemption_amount: '0',
      total_amount: this.billingTotalAmount,
      document_type: 'receipt',
      document_number: 'R260701001',
      status: 'issued',
      sent_at: null,
      needs_resend: false,
      content_revision: '0',
      boleto_change_pending: false,
      boleto_change_operation_id: null,
      boleto_change_started_at: null,
      notes: null,
      created_at: '2026-07-06T00:00:00.000Z',
      updated_at: '2026-07-06T00:00:00.000Z',
    };
  }

  async upsertBillingLines(records: BillingLine[]): Promise<BillingLine[]> {
    this.upsertedBillingLines = records;
    return records;
  }

  async deleteMissingBillingLines(): Promise<void> {
  }

  async listBillingCyclesByContractId(_organizationId: string, contractId: string): Promise<BillingCycle[]> {
    return this.billingCycles.filter((billing) => billing.contract_id === contractId);
  }

  async insertPayment(record: Omit<Payment, 'id' | 'created_at' | 'updated_at'>): Promise<Payment> {
    this.insertedPayment = record;
    return {
      id: 'payment-1',
      created_at: '2026-07-06T00:00:00.000Z',
      updated_at: '2026-07-06T00:00:00.000Z',
      ...record,
    };
  }

  async listPaymentsByBillingCycleId(_organizationId: string, _billingCycleId: string): Promise<Payment[]> {
    const existing = this.paymentsByBillingCycleId.get(_billingCycleId);
    if (existing) {
      return existing;
    }

    return this.insertedPayment == null
      ? []
      : [
          {
            id: 'payment-1',
            created_at: '2026-07-06T00:00:00.000Z',
            updated_at: '2026-07-06T00:00:00.000Z',
            ...this.insertedPayment,
          },
        ];
  }
}

describe('billing mutations', () => {
  it('returns only the common billing projection from affected mutation queries', async () => {
    const selectedColumns: string[] = [];
    const billing = {
      id: 'billing-1',
      organization_id: 'org-1',
      contract_id: 'contract-1',
      period_start: '2026-08-01',
      period_end: '2026-08-31',
      issue_date: '2026-08-01',
      due_date: '2026-08-10',
      total_amount: '10000',
      status: 'issued',
    } as BillingCycle;
    const query = {
      insert: vi.fn(() => query),
      update: vi.fn(() => query),
      select: vi.fn((columns: string) => {
        selectedColumns.push(columns);
        return query;
      }),
      eq: vi.fn(() => query),
      single: vi.fn(async () => ({ data: billing, error: null })),
      order: vi.fn(async () => ({ data: [billing], error: null })),
    };
    const client = createSupabaseContractsLocacoesMutationClient({
      from: vi.fn(() => query),
    } as never);

    await client.insertBillingCycle?.(billing as BillingCycleInsertRecord);
    await client.updateBillingCycle?.('org-1', 'billing-1', { notes: 'Atualizada' });
    await client.getBillingCycleById?.('org-1', 'billing-1');
    await client.listBillingCyclesByContractId?.('org-1', 'contract-1');

    expect(selectedColumns).toHaveLength(4);
    for (const projection of selectedColumns) {
      expect(projection).not.toBe('*');
      for (const restricted of [
        'sent_at',
        'needs_resend',
        'content_revision',
        'boleto_change_pending',
        'boleto_change_operation_id',
        'boleto_change_started_at',
      ]) {
        expect(projection.split(',').map((column) => column.trim())).not.toContain(restricted);
      }
    }
  });

  it('inserts new billing lines without requiring update access to immutable columns', async () => {
    const line: BillingLine = {
      id: 'line-1',
      organization_id: 'org-1',
      billing_cycle_id: 'billing-1',
      rental_item_id: 'item-1',
      description: 'Locação mensal',
      quantity: 1,
      unit_amount: '150000',
      total_amount: '150000',
      kind: 'recurring',
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z',
    };
    const insert = vi.fn(() => query);
    const query = {
      insert,
      select: vi.fn(async () => ({ data: [line], error: null })),
    };
    const client = createSupabaseContractsLocacoesMutationClient({
      from: vi.fn(() => query),
    } as never);

    await expect(client.upsertBillingLines?.([line])).resolves.toEqual([line]);
    expect(insert).toHaveBeenCalledWith([line]);
  });

  it('creates a manual monthly billing cycle with recurring lines', async () => {
    const client = new FakeBillingMutationClient();

    const result = await createBillingCycle(client, {
      contract_id: 'contract-1',
      period_start: '2026-07-01',
      period_end: '2026-07-30',
      issue_date: '2026-07-01',
      due_date: '2026-07-31',
      document_type: 'receipt',
      document_number: 'R260701001',
      sequence_number: 1,
      notes: '',
      discount_amount: '1000',
      surcharge_amount: '0',
      exemption_amount: '0',
      items: [
        {
          id: 'line-1',
          rental_item_id: 'item-1',
          description: 'Locação mensal',
          quantity: 1,
          unit_amount: '150000',
          kind: 'recurring',
        },
      ],
    });

    expect(result.billing.id).toBe('billing-1');
    expect(result.billing.total_amount).toBe('149000');
    expect(client.upsertedBillingLines).toHaveLength(1);
  });

  it('creates two itemized recurring lines and derives the billing total from them', async () => {
    const client = new FakeBillingMutationClient();

    const result = await createBillingCycle(client, {
      contract_id: 'contract-1',
      period_start: '2026-07-01',
      period_end: '2026-07-30',
      issue_date: '2026-07-01',
      due_date: '2026-07-31',
      document_type: 'receipt',
      document_number: 'R260701001',
      sequence_number: 1,
      notes: '',
      discount_amount: '0',
      surcharge_amount: '0',
      exemption_amount: '0',
      items: [
        {
          id: 'line-1',
          rental_item_id: 'item-1',
          description: 'Transformador 500 kVA - Série ABC123',
          quantity: 1,
          unit_amount: '150000',
          kind: 'recurring',
        },
        {
          id: 'line-2',
          rental_item_id: 'item-2',
          description: 'Transformador 300 kVA - Série XYZ789',
          quantity: 1,
          unit_amount: '150000',
          kind: 'recurring',
        },
      ],
    });

    expect(result.billing.total_amount).toBe('300000');
    expect(result.lines).toHaveLength(2);
    expect(result.lines.map((line) => line.rental_item_id)).toEqual(['item-1', 'item-2']);
    expect(result.lines.map((line) => line.total_amount)).toEqual(['150000', '150000']);
  });

  it('auto-generates the approved short receipt number from the internal contract number', async () => {
    const client = new FakeBillingMutationClient();

    await createBillingCycle(client, {
      contract_id: 'contract-1',
      period_start: '2026-07-01',
      period_end: '2026-07-30',
      issue_date: '2026-07-01',
      due_date: '2026-07-31',
      document_type: 'receipt',
      document_number: '',
      sequence_number: 1,
      notes: '',
      discount_amount: '0',
      surcharge_amount: '0',
      exemption_amount: '0',
      items: [
        {
          id: 'line-1',
          rental_item_id: 'item-1',
          description: 'Locação mensal',
          quantity: 1,
          unit_amount: '150000',
          kind: 'recurring',
        },
      ],
    });

    expect(client.insertedBilling?.document_number).toBe('R000023001');
  });

  it('keeps partial payments out of paid status until the full amount is reached', async () => {
    const client = new FakeBillingMutationClient();

    const result = await recordBillingPayment(client, 'billing-1', {
      billing_cycle_id: 'billing-1',
      paid_at: '2026-07-15',
      amount: '50000',
      notes: 'Entrada',
    });

    expect(result.billing.status).toBe('issued');
    expect(result.balance.balance_amount).toBe('100000');
    expect(result.payments).toHaveLength(1);
  });

  it('uses the real billing total when recalculating balance and status after payment', async () => {
    const client = new FakeBillingMutationClient();
    client.billingTotalAmount = '200000';

    const result = await recordBillingPayment(client, 'billing-1', {
      billing_cycle_id: 'billing-1',
      paid_at: '2026-07-15',
      amount: '50000',
      notes: 'Entrada',
    });

    expect(result.billing.status).toBe('issued');
    expect(result.balance.paid_amount).toBe('50000');
    expect(result.balance.balance_amount).toBe('150000');
  });

  it('keeps an already overdue billing overdue after a partial payment', async () => {
    const client = new FakeBillingMutationClient();
    client.billingDueDate = '2026-07-10';

    const result = await recordBillingPayment(client, 'billing-1', {
      billing_cycle_id: 'billing-1',
      paid_at: '2026-07-15',
      amount: '50000',
      notes: 'Pagamento parcial atrasado',
    });

    expect(result.billing.status).toBe('overdue');
  });

  it('rejects duplicated or overlapping periods before creating a billing cycle', async () => {
    const client = new FakeBillingMutationClient();
    client.billingCycles = [
      {
        ...(await client.getBillingCycleById('org-1', 'billing-existing')),
        id: 'billing-existing',
        period_start: '2026-07-01',
        period_end: '2026-07-31',
      },
    ];

    await expect(createBillingCycle(client, {
      contract_id: 'contract-1',
      period_start: '2026-07-15',
      period_end: '2026-08-14',
      issue_date: '2026-07-15',
      due_date: '2026-08-14',
      document_type: 'receipt',
      document_number: '',
      sequence_number: 2,
      notes: '',
      discount_amount: '0',
      surcharge_amount: '0',
      exemption_amount: '0',
      items: [
        {
          id: 'line-1',
          rental_item_id: null,
          description: 'Locação mensal',
          quantity: 1,
          unit_amount: '150000',
          kind: 'recurring',
        },
      ],
    })).rejects.toThrow('sobrepõe');

    expect(client.insertedBilling).toBeNull();
  });

  it('rejects creating a billing cycle that starts after the contract end_date', async () => {
    const client = new FakeBillingMutationClient();
    client.contractEndDate = '2026-08-20';
    client.contractStatus = 'awaiting_return';

    await expect(createBillingCycle(client, {
      contract_id: 'contract-1',
      period_start: '2026-08-21',
      period_end: '2026-09-20',
      issue_date: '2026-08-21',
      due_date: '2026-09-20',
      document_type: 'receipt',
      document_number: '',
      sequence_number: 3,
      notes: '',
      discount_amount: '0',
      surcharge_amount: '0',
      exemption_amount: '0',
      items: [
        {
          id: 'line-1',
          rental_item_id: null,
          description: 'Locação mensal',
          quantity: 1,
          unit_amount: '150000',
          kind: 'recurring',
        },
      ],
    })).rejects.toThrow('posterior ao encerramento');

    expect(client.insertedBilling).toBeNull();
    expect(client.upsertedBillingLines).toHaveLength(0);
  });

  it('rejects creating a billing cycle that passes the contract end_date', async () => {
    const client = new FakeBillingMutationClient();
    client.contractEndDate = '2026-08-20';

    await expect(createBillingCycle(client, {
      contract_id: 'contract-1',
      period_start: '2026-08-01',
      period_end: '2026-08-31',
      issue_date: '2026-08-01',
      due_date: '2026-08-31',
      document_type: 'receipt',
      document_number: '',
      sequence_number: 2,
      notes: '',
      discount_amount: '0',
      surcharge_amount: '0',
      exemption_amount: '0',
      items: [
        {
          id: 'line-1',
          rental_item_id: null,
          description: 'Locação mensal',
          quantity: 1,
          unit_amount: '150000',
          kind: 'recurring',
        },
      ],
    })).rejects.toThrow('não pode ultrapassar');

    expect(client.insertedBilling).toBeNull();
  });

  it('keeps contracts without end_date using the previous billing creation behavior', async () => {
    const client = new FakeBillingMutationClient();

    const result = await createBillingCycle(client, {
      contract_id: 'contract-1',
      period_start: '2026-09-01',
      period_end: '2026-09-30',
      issue_date: '2026-09-01',
      due_date: '2026-09-30',
      document_type: 'receipt',
      document_number: '',
      sequence_number: 3,
      notes: '',
      discount_amount: '0',
      surcharge_amount: '0',
      exemption_amount: '0',
      items: [
        {
          id: 'line-1',
          rental_item_id: null,
          description: 'Locação mensal',
          quantity: 1,
          unit_amount: '150000',
          kind: 'recurring',
        },
      ],
    });

    expect(result.billing.period_end).toBe('2026-09-30');
    expect(result.billing.total_amount).toBe('150000');
  });

  it('updates dates and notes without replacing the itemized billing lines', async () => {
    const client = new FakeBillingMutationClient();
    client.billingCycles = [
      {
        ...(await client.getBillingCycleById('org-1', 'billing-1')),
        id: 'billing-1',
        period_start: '2026-07-01',
        period_end: '2026-07-31',
      },
      {
        ...(await client.getBillingCycleById('org-1', 'billing-2')),
        id: 'billing-2',
        sequence_number: 2,
        period_start: '2026-08-01',
        period_end: '2026-08-31',
      },
    ];

    const result = await updateBillingCycleDetails(client, 'billing-1', {
      period_start: '2026-07-02',
      period_end: '2026-07-30',
      issue_date: '2026-07-02',
      due_date: '2026-07-31',
      amount: '150000',
      notes: 'Ajuste aprovado',
    });

    expect(result.billing.total_amount).toBe('150000');
    expect(client.updatedBillingStatus?.patch).toMatchObject({
      period_start: '2026-07-02',
      period_end: '2026-07-30',
      notes: 'Ajuste aprovado',
    });
    expect(client.updatedBillingStatus?.patch).not.toHaveProperty('total_amount');
    expect(client.upsertedBillingLines).toHaveLength(0);
    expect(result.lines).toHaveLength(0);
  });

  it('blocks manual amount changes instead of collapsing itemized lines', async () => {
    const client = new FakeBillingMutationClient();
    client.billingCycles = [
      {
        ...(await client.getBillingCycleById('org-1', 'billing-1')),
        id: 'billing-1',
        total_amount: '150000',
        period_start: '2026-07-01',
        period_end: '2026-07-31',
      },
    ];
    await expect(updateBillingCycleDetails(client, 'billing-1', {
      period_start: '2026-07-02',
      period_end: '2026-07-31',
      issue_date: '2026-07-02',
      due_date: '2026-07-31',
      amount: '160000',
      notes: 'Tentativa',
    })).rejects.toThrow(
      'Para alterar o valor da locação, edite os valores dos equipamentos. A alteração será aplicada aos próximos períodos.'
    );

    expect(client.updatedBillingStatus).toBeNull();
    expect(client.upsertedBillingLines).toHaveLength(0);

    const result = await updateBillingCycleDetails(client, 'billing-1', {
      period_start: '2026-07-02',
      period_end: '2026-07-31',
      issue_date: '2026-07-02',
      due_date: '2026-07-31',
      amount: '150000',
      notes: 'Datas ajustadas',
    });

    expect(result.billing.notes).toBe('Datas ajustadas');
    expect(client.upsertedBillingLines).toHaveLength(0);
  });

  it('rejects editing a billing cycle to pass the closed contract end_date without touching payments', async () => {
    const client = new FakeBillingMutationClient();
    client.contractEndDate = '2026-08-20';
    client.contractStatus = 'closed';
    client.billingCycles = [
      {
        ...(await client.getBillingCycleById('org-1', 'billing-1')),
        id: 'billing-1',
        period_start: '2026-08-01',
        period_end: '2026-08-20',
      },
    ];
    client.paymentsByBillingCycleId.set('billing-1', [
      {
        id: 'payment-1',
        organization_id: 'org-1',
        billing_cycle_id: 'billing-1',
        paid_at: '2026-08-15',
        amount: '150000',
        notes: null,
        created_at: '2026-08-15T00:00:00.000Z',
        updated_at: '2026-08-15T00:00:00.000Z',
      },
    ]);

    await expect(updateBillingCycleDetails(client, 'billing-1', {
      period_start: '2026-08-01',
      period_end: '2026-08-31',
      issue_date: '2026-08-01',
      due_date: '2026-08-31',
      amount: '150000',
      notes: 'Tentativa posterior',
    })).rejects.toThrow('não pode ultrapassar');

    expect(client.updatedBillingStatus).toBeNull();
    expect(client.insertedPayment).toBeNull();
  });

  it('rejects a payment payload for a different billing cycle before inserting it', async () => {
    const client = new FakeBillingMutationClient();

    await expect(recordBillingPayment(client, 'billing-1', {
      billing_cycle_id: 'billing-2',
      paid_at: '2026-07-15',
      amount: '50000',
      notes: 'Cobrança divergente',
    })).rejects.toThrow('Recebimento não pertence à cobrança informada.');

    expect(client.insertedPayment).toBeNull();
  });
});
