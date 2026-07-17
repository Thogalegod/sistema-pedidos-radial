import { describe, expect, it } from 'vitest';
import {
  createBillingCycle,
  recordBillingPayment,
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
  public insertedBilling: Omit<BillingCycle, 'id' | 'created_at' | 'updated_at'> | null = null;
  public upsertedBillingLines: BillingLine[] = [];
  public insertedPayment: Omit<Payment, 'id' | 'created_at' | 'updated_at'> | null = null;
  public updatedBillingStatus: { billingCycleId: string; patch: Partial<BillingCycle> } | null = null;
  public billingTotalAmount = '150000';
  public billingDueDate = '2026-07-31';

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
      end_date: null,
      recurrence_days: 30,
      pricing_model: 'fixed',
      base_amount: '150000',
      percentage_rate: null,
      status: 'active',
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

  async insertBillingCycle(record: Omit<BillingCycle, 'id' | 'created_at' | 'updated_at'>): Promise<BillingCycle> {
    this.insertedBilling = record;
    this.billingTotalAmount = record.total_amount;
    return {
      id: 'billing-1',
      created_at: '2026-07-06T00:00:00.000Z',
      updated_at: '2026-07-06T00:00:00.000Z',
      ...record,
    };
  }

  async updateBillingCycle(billingCycleId: string, patch: Partial<BillingCycle>): Promise<BillingCycle> {
    this.updatedBillingStatus = { billingCycleId, patch };
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
      notes: null,
      created_at: '2026-07-06T00:00:00.000Z',
      updated_at: '2026-07-06T00:00:00.000Z',
      ...patch,
    };
  }

  async getBillingCycleById(_organizationId: string, billingCycleId: string): Promise<BillingCycle> {
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
});
