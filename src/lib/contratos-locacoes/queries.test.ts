import { describe, expect, it } from 'vitest';
import { getContract, listBillings, type ContractsLocacoesReadClient } from './queries';
import type { BillingCycle, Contract, Customer, CustomerContact, CustomerSite, Payment, RentalItem } from './types';

function makeBillingCycle(overrides: Partial<BillingCycle> = {}): BillingCycle {
  return {
    id: 'billing-1',
    organization_id: 'org-1',
    contract_id: 'contract-1',
    sequence_number: 1,
    period_start: '2026-08-08',
    period_end: '2026-09-07',
    issue_date: '2026-08-08',
    due_date: '2026-08-15',
    base_amount: '300000',
    discount_amount: '0',
    surcharge_amount: '0',
    exemption_amount: '0',
    total_amount: '300000',
    document_type: 'receipt',
    document_number: 'R000077001',
    status: 'issued',
    sent_at: '2026-08-10T17:30:00.000Z',
    notes: null,
    created_at: '2026-08-08T00:00:00.000Z',
    updated_at: '2026-08-08T00:00:00.000Z',
    ...overrides,
  };
}

class FakeReadClient implements ContractsLocacoesReadClient {
  async getCurrentOrganizationId() {
    return 'org-1';
  }

  async listCustomersByOrganization(): Promise<Customer[]> {
    return [
      {
        id: 'customer-1',
        organization_id: 'org-1',
        legal_name: 'Cliente QA',
        trade_name: 'QA',
        tax_id: null,
        state_registration: null,
        municipal_registration: null,
        notes: null,
        active: true,
        created_at: '2026-08-08T00:00:00.000Z',
        updated_at: '2026-08-08T00:00:00.000Z',
      },
    ];
  }

  async listSitesByCustomerIds(): Promise<CustomerSite[]> {
    return [
      {
        id: 'site-1',
        organization_id: 'org-1',
        customer_id: 'customer-1',
        name: 'Obra QA',
        address_line: 'Rua A',
        number: '100',
        complement: null,
        district: 'Centro',
        city: 'Campinas',
        state: 'SP',
        postal_code: '13000-000',
        notes: null,
        active: true,
        created_at: '2026-08-08T00:00:00.000Z',
        updated_at: '2026-08-08T00:00:00.000Z',
      },
    ];
  }

  async listContactsByCustomerIds(): Promise<CustomerContact[]> {
    return [];
  }

  async getCustomerById(): Promise<Customer> {
    return this.listCustomersByOrganization().then((customers) => customers[0]);
  }

  async listContractsByOrganization(): Promise<Contract[]> {
    return [
      {
        id: 'contract-1',
        organization_id: 'org-1',
        internal_number: '77',
        kind: 'rental',
        contract_company: 'radial',
        customer_id: 'customer-1',
        site_id: 'site-1',
        legacy_order_number: 'OS-QA-77',
        transport_notes: null,
        has_remittance_invoice: false,
        remittance_invoice_number: null,
        remittance_invoice_issuer: null,
        remittance_invoice_amount: null,
        remittance_invoice_issue_date: null,
        start_date: '2026-08-08',
        end_date: null,
        recurrence_days: 30,
        pricing_model: 'fixed',
        base_amount: '300000',
        percentage_rate: null,
        status: 'active',
        pause_started_at: null,
        pause_reason: null,
        notes: null,
        created_at: '2026-08-08T00:00:00.000Z',
        updated_at: '2026-08-08T00:00:00.000Z',
      },
    ];
  }

  async getContractById(): Promise<Contract> {
    return this.listContractsByOrganization().then((contracts) => contracts[0]);
  }

  async listRentalItemsByContractIds(): Promise<RentalItem[]> {
    return [];
  }

  async listBillingCyclesByOrganization(): Promise<BillingCycle[]> {
    return [makeBillingCycle()];
  }

  async listBillingCyclesByContractId(_organizationId: string, contractId: string): Promise<BillingCycle[]> {
    const billingCycles = [makeBillingCycle()];
    return billingCycles.filter((billing) => billing.contract_id === contractId);
  }

  async listBillingLinesByBillingCycleIds() {
    return [];
  }

  async listPaymentsByBillingCycleIds(): Promise<Payment[]> {
    return [
      {
        id: 'payment-1',
        organization_id: 'org-1',
        billing_cycle_id: 'billing-1',
        paid_at: '2026-08-14',
        amount: '100000',
        notes: 'Entrada',
        created_at: '2026-08-14T00:00:00.000Z',
        updated_at: '2026-08-14T00:00:00.000Z',
      },
    ];
  }
}

describe('contracts rental queries', () => {
  it('maps consolidated billing data with period, sent_at, paid amount and balance', async () => {
    const [billing] = await listBillings(new FakeReadClient(), '2026-08-12');

    expect(billing).toMatchObject({
      id: 'billing-1',
      internal_number: '77',
      customer_name: 'Cliente QA',
      site_name: 'Obra QA',
      period_start: '2026-08-08',
      period_end: '2026-09-07',
      sent_at: '2026-08-10T17:30:00.000Z',
      paid_amount: '100000',
      balance_amount: '200000',
      status: 'issued',
    });
  });

  it('searches billings when Supabase returns numeric contract internal numbers', async () => {
    class NumericInternalNumberReadClient extends FakeReadClient {
      async listContractsByOrganization(): Promise<Contract[]> {
        const contracts = await super.listContractsByOrganization();
        return [
          {
            ...contracts[0],
            internal_number: 77 as unknown as Contract['internal_number'],
          },
        ];
      }
    }

    const [billing] = await listBillings(new NumericInternalNumberReadClient(), '2026-08-12', {
      search: '77',
    });

    expect(billing).toMatchObject({
      id: 'billing-1',
      internal_number: 77,
    });
  });

  it('loads contract detail through contract-scoped customer and billing queries', async () => {
    class DetailReadClient extends FakeReadClient {
      public listedCustomers = false;
      public listedBillingCyclesByOrganization = false;

      async listCustomersByOrganization(): Promise<Customer[]> {
        this.listedCustomers = true;
        throw new Error('should not list every customer for one contract detail');
      }

      async getCustomerById(): Promise<Customer> {
        return {
          id: 'customer-1',
          organization_id: 'org-1',
          legal_name: 'Cliente QA',
          trade_name: 'QA',
          tax_id: null,
          state_registration: null,
          municipal_registration: null,
          notes: null,
          active: true,
          created_at: '2026-08-08T00:00:00.000Z',
          updated_at: '2026-08-08T00:00:00.000Z',
        };
      }

      async listBillingCyclesByOrganization(): Promise<BillingCycle[]> {
        this.listedBillingCyclesByOrganization = true;
        throw new Error('should not list every billing cycle for one contract detail');
      }
    }

    const client = new DetailReadClient();

    const detail = await getContract(client, 'contract-1');

    expect(detail.customer?.id).toBe('customer-1');
    expect(detail.billingCycles.map((billing) => billing.id)).toEqual(['billing-1']);
    expect(client.listedCustomers).toBe(false);
    expect(client.listedBillingCyclesByOrganization).toBe(false);
  });
});
