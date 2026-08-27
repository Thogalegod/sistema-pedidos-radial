import { describe, expect, it, vi } from 'vitest';
import {
  createSupabaseContractsLocacoesReadClient,
  getContract,
  listBillings,
  listContracts,
  type ContractsLocacoesReadClient,
} from './queries';
import type { BillingCycle, BillingDeliveryEvent, Contract, ContractDocument, Customer, CustomerContact, CustomerSite, OrganizationMember, Payment, RentalItem } from './types';

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
    needs_resend: false,
    content_revision: '0',
    boleto_change_pending: false,
    boleto_change_operation_id: null,
    boleto_change_started_at: null,
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

  async getCurrentOrganizationMembership(): Promise<OrganizationMember> {
    return {
      organization_id: 'org-1',
      user_id: 'user-1',
      role: 'admin',
      can_manage_billing: false,
      created_at: '2026-08-08T00:00:00.000Z',
    } as OrganizationMember;
  }

  async listBillingDeliveryIndicatorsByOrganization() {
    return [{ id: 'billing-1', sent_at: '2026-08-10T17:30:00.000Z', needs_resend: true }];
  }

  async listBoletoDocumentsByContractIds(): Promise<ContractDocument[]> {
    return [{
      id: 'boleto-1',
      organization_id: 'org-1',
      contract_id: 'contract-1',
      billing_cycle_id: 'billing-1',
      payment_id: null,
      inspection_id: null,
      kind: 'boleto',
      storage_path: 'org-1/contract-1/boleto/billing-1.pdf',
      file_name: 'billing-1.pdf',
      content_type: 'application/pdf',
      created_by: 'user-1',
      created_at: '2026-08-10T00:00:00.000Z',
    } as ContractDocument];
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

  async listBillingCyclesForMonthlyList() {
    return (await this.listBillingCyclesByOrganization()).map((billing) => ({
      id: billing.id,
      contract_id: billing.contract_id,
      document_number: billing.document_number,
      document_type: billing.document_type,
      due_date: billing.due_date,
      issue_date: billing.issue_date,
      period_start: billing.period_start,
      period_end: billing.period_end,
      total_amount: billing.total_amount,
      status: billing.status,
    }));
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
  it('enriches rental cards from current items and one organization-wide billing query', async () => {
    class ContractListReadClient extends FakeReadClient {
      public organizationBillingQueries = 0;
      public contractBillingQueries = 0;

      async listRentalItemsByContractIds(): Promise<RentalItem[]> {
        return [
          makeRentalItem({ id: 'item-1', quantity: 1, unit_amount: '150000' }),
          makeRentalItem({ id: 'item-2', quantity: 1, unit_amount: '150000' }),
        ];
      }

      async listBillingCyclesByOrganization(): Promise<BillingCycle[]> {
        this.organizationBillingQueries += 1;
        return [
          makeBillingCycle({ id: 'issued', period_end: '2026-08-31', due_date: '2026-09-10', status: 'issued' }),
          makeBillingCycle({ id: 'draft', period_end: '2026-09-30', due_date: '2026-10-10', status: 'draft' }),
        ];
      }

      async listBillingCyclesByContractId(): Promise<BillingCycle[]> {
        this.contractBillingQueries += 1;
        return [];
      }
    }

    const client = new ContractListReadClient();
    const [contract] = await listContracts(client, {}, '2026-09-01');

    expect(contract).toMatchObject({
      current_monthly_amount: '300000',
      latest_billing_period_end: '2026-08-31',
      latest_billing_due_date: '2026-09-10',
      billing_coverage_status: 'new_period_required',
    });
    expect(client.organizationBillingQueries).toBe(1);
    expect(client.contractBillingQueries).toBe(0);
  });

  it('derives the list amount from changed current item values rather than the latest invoice', async () => {
    class UpdatedItemPriceReadClient extends FakeReadClient {
      async listRentalItemsByContractIds(): Promise<RentalItem[]> {
        return [makeRentalItem({ quantity: 2, unit_amount: '175000' })];
      }

      async listBillingCyclesByOrganization(): Promise<BillingCycle[]> {
        return [makeBillingCycle({ total_amount: '300000', base_amount: '300000' })];
      }
    }

    const [contract] = await listContracts(new UpdatedItemPriceReadClient(), {}, '2026-08-30');

    expect(contract.current_monthly_amount).toBe('350000');
    expect(contract.billing_coverage_status).toBe('current');
  });

  it('maps consolidated billing data with period, sent_at, paid amount and balance', async () => {
    const [billing] = await listBillings(new FakeReadClient(), '2026-08-12');

    expect(billing).toMatchObject({
      id: 'billing-1',
      internal_number: '77',
      customer_name: 'Cliente QA',
      site_name: 'Obra QA',
      period_start: '2026-08-08',
      period_end: '2026-09-07',
      paid_amount: '100000',
      balance_amount: '200000',
      status: 'issued',
      delivery_indicators: {
        sent_at: '2026-08-10T17:30:00.000Z',
        needs_resend: true,
        has_boleto: true,
      },
    });
  });

  it('does not query or infer restricted delivery indicators for a common member', async () => {
    class CommonMemberReadClient extends FakeReadClient {
      public restrictedQueries = 0;

      async getCurrentOrganizationMembership(): Promise<OrganizationMember> {
        return {
          organization_id: 'org-1', user_id: 'user-1', role: 'member',
          can_manage_billing: false, created_at: '2026-08-08T00:00:00.000Z',
        } as OrganizationMember;
      }

      async listBillingDeliveryIndicatorsByOrganization() {
        this.restrictedQueries += 1;
        return [];
      }

      async listBoletoDocumentsByContractIds(): Promise<ContractDocument[]> {
        this.restrictedQueries += 1;
        return [];
      }
    }

    const client = new CommonMemberReadClient();
    const [billing] = await listBillings(client, '2026-08-12');

    expect(billing.delivery_indicators).toBeNull();
    expect(client.restrictedQueries).toBe(0);
  });

  it('limits billings to the selected due-date month before applying filters and priority', async () => {
    class MonthlyBillingReadClient extends FakeReadClient {
      async listBillingCyclesByOrganization(): Promise<BillingCycle[]> {
        return [
          makeBillingCycle({ id: 'outside', document_number: 'FORA', due_date: '2026-09-01' }),
          makeBillingCycle({ id: 'future', document_number: 'FUTURA', due_date: '2026-08-25' }),
          makeBillingCycle({ id: 'overdue-old', document_number: 'VENCIDA-ANTIGA', due_date: '2026-08-05' }),
          makeBillingCycle({ id: 'overdue-recent', document_number: 'VENCIDA-RECENTE', due_date: '2026-08-11' }),
        ];
      }

      async listPaymentsByBillingCycleIds(): Promise<Payment[]> {
        return [];
      }
    }

    const billings = await listBillings(new MonthlyBillingReadClient(), '2026-08-12', {
      month: '2026-08',
      status: 'overdue',
      search: 'vencida',
    });

    expect(billings.map((billing) => billing.id)).toEqual(['overdue-recent', 'overdue-old']);
  });

  it('includes contract notes and returns rentals in billing urgency order', async () => {
    class PrioritizedContractReadClient extends FakeReadClient {
      async listContractsByOrganization(): Promise<Contract[]> {
        const [base] = await super.listContractsByOrganization();
        return [
          { ...base, id: 'inactive', status: 'paused', start_date: '2026-01-01' },
          { ...base, id: 'first', start_date: '2026-07-01', notes: 'Cliente pede aviso antes da emissão.' },
          { ...base, id: 'new', start_date: '2026-06-01' },
          { ...base, id: 'current', start_date: '2026-05-01' },
        ];
      }

      async listBillingCyclesByOrganization(): Promise<BillingCycle[]> {
        return [
          makeBillingCycle({ id: 'new-billing', contract_id: 'new', period_end: '2026-08-01' }),
          makeBillingCycle({ id: 'current-billing', contract_id: 'current', period_end: '2026-08-31' }),
        ];
      }
    }

    const contracts = await listContracts(new PrioritizedContractReadClient(), {}, '2026-08-12');

    expect(contracts.map((contract) => contract.id)).toEqual(['new', 'first', 'current', 'inactive']);
    expect(contracts.find((contract) => contract.id === 'first')?.notes).toBe('Cliente pede aviso antes da emissão.');
  });

  it('filters contracts by the selected customer and keeps every contract when the filter is empty', async () => {
    class TwoCustomerReadClient extends FakeReadClient {
      async listCustomersByOrganization(): Promise<Customer[]> {
        const [baseCustomer] = await super.listCustomersByOrganization();
        return [
          baseCustomer,
          { ...baseCustomer, id: 'customer-2', legal_name: 'Cliente Obra Sul', trade_name: 'Obra Sul' },
        ];
      }

      async listContractsByOrganization(): Promise<Contract[]> {
        const [baseContract] = await super.listContractsByOrganization();
        return [
          baseContract,
          { ...baseContract, id: 'contract-2', internal_number: '78', customer_id: 'customer-2', legacy_order_number: 'OS-QA-78' },
        ];
      }
    }

    const client = new TwoCustomerReadClient();

    const filtered = await listContracts(client, { customerId: 'customer-2' }, '2026-08-12');

    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({ id: 'contract-2', customer_name: 'Cliente Obra Sul' });

    const withEmptyCustomer = await listContracts(client, { customerId: '' }, '2026-08-12');
    const withoutCustomerFilter = await listContracts(client, {}, '2026-08-12');

    expect(withEmptyCustomer.map((contract) => contract.id).sort()).toEqual(['contract-1', 'contract-2']);
    expect(withoutCustomerFilter.map((contract) => contract.id).sort()).toEqual(['contract-1', 'contract-2']);
  });

  it('combines the customer filter with kind, status and search filters and handles customers without contracts', async () => {
    class CombinedCustomerFilterReadClient extends FakeReadClient {
      async listCustomersByOrganization(): Promise<Customer[]> {
        const [baseCustomer] = await super.listCustomersByOrganization();
        return [
          baseCustomer,
          { ...baseCustomer, id: 'customer-2', legal_name: 'Cliente Obra Sul', trade_name: 'Obra Sul' },
          { ...baseCustomer, id: 'customer-empty', legal_name: 'Cliente Sem Contrato', trade_name: 'Sem Contrato' },
        ];
      }

      async listContractsByOrganization(): Promise<Contract[]> {
        const [baseContract] = await super.listContractsByOrganization();
        return [
          baseContract,
          { ...baseContract, id: 'contract-2', internal_number: '78', customer_id: 'customer-2', legacy_order_number: 'OS-QA-78', status: 'closed' },
          { ...baseContract, id: 'contract-3', internal_number: '79', customer_id: 'customer-1', kind: 'energy_management', legacy_order_number: 'OS-QA-79' },
          { ...baseContract, id: 'contract-orphan', internal_number: '80', customer_id: 'customer-gone', legacy_order_number: 'OS-QA-80' },
        ];
      }
    }

    const client = new CombinedCustomerFilterReadClient();

    const unfiltered = await listContracts(client, {}, '2026-08-12');
    expect(unfiltered.find((contract) => contract.id === 'contract-orphan')?.customer_name).toBe('Cliente removido');

    const byKind = await listContracts(client, { customerId: 'customer-1', kind: 'energy_management' }, '2026-08-12');
    expect(byKind.map((contract) => contract.id)).toEqual(['contract-3']);

    const byStatus = await listContracts(client, { customerId: 'customer-2', status: 'closed' }, '2026-08-12');
    expect(byStatus.map((contract) => contract.id)).toEqual(['contract-2']);

    const byStatusMiss = await listContracts(client, { customerId: 'customer-2', status: 'active' }, '2026-08-12');
    expect(byStatusMiss).toEqual([]);

    const bySearch = await listContracts(client, { customerId: 'customer-1', search: 'OS-QA-77' }, '2026-08-12');
    expect(bySearch.map((contract) => contract.id)).toEqual(['contract-1']);

    const customerWithoutContracts = await listContracts(client, { customerId: 'customer-empty' }, '2026-08-12');
    expect(customerWithoutContracts).toEqual([]);
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
    expect(detail.membership.role).toBe('admin');
    expect(detail.boletoDocuments.map((document) => document.id)).toEqual(['boleto-1']);
    expect(client.listedCustomers).toBe(false);
    expect(client.listedBillingCyclesByOrganization).toBe(false);
  });

  it('requests only the explicit common projection for contract billing detail', async () => {
    let selectedColumns = '';
    const query = {
      select: vi.fn((columns: string) => {
        selectedColumns = columns;
        return query;
      }),
      eq: vi.fn(() => query),
      order: vi.fn(async () => ({ data: [], error: null })),
    };
    const client = createSupabaseContractsLocacoesReadClient({
      from: vi.fn(() => query),
    } as never);

    await client.listBillingCyclesByContractId?.('org-1', 'contract-1');

    expect(selectedColumns).not.toBe('*');
    for (const restricted of [
      'sent_at',
      'needs_resend',
      'content_revision',
      'boleto_change_pending',
      'boleto_change_operation_id',
      'boleto_change_started_at',
    ]) {
      expect(selectedColumns.split(',').map((column) => column.trim())).not.toContain(restricted);
    }
  });

  it('orders billing lines totally by created_at and id before building invoices', async () => {
    const orderCalls: Array<[string, { ascending: boolean }]> = [];
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      in: vi.fn(() => query),
      order: vi.fn((column: string, options: { ascending: boolean }) => {
        orderCalls.push([column, options]);
        return column === 'id' ? Promise.resolve({ data: [], error: null }) : query;
      }),
    };
    const client = createSupabaseContractsLocacoesReadClient({ from: vi.fn(() => query) } as never);

    await client.listBillingLinesByBillingCycleIds?.('org-1', ['billing-1']);

    expect(orderCalls).toEqual([
      ['created_at', { ascending: true }],
      ['id', { ascending: true }],
    ]);
  });

  it('removes restricted billing state from a common member contract detail', async () => {
    class MemberDetailReadClient extends FakeReadClient {
      async getCurrentOrganizationMembership(): Promise<OrganizationMember> {
        return {
          organization_id: 'org-1',
          user_id: 'member-1',
          role: 'member',
          can_manage_billing: false,
          created_at: '2026-08-08T00:00:00.000Z',
        } as OrganizationMember;
      }
    }

    const detail = await getContract(new MemberDetailReadClient(), 'contract-1');
    const billing = detail.billingCycles[0] as unknown as Record<string, unknown>;

    for (const restricted of [
      'sent_at',
      'needs_resend',
      'content_revision',
      'boleto_change_pending',
      'boleto_change_operation_id',
      'boleto_change_started_at',
    ]) {
      expect(billing).not.toHaveProperty(restricted);
    }
    expect(detail.boletoDocuments).toEqual([]);
    expect(detail.billingDeliveryEvents).toEqual([]);
  });

  it('loads restricted billing state separately for an authorized contract detail', async () => {
    const listBillingDetailIndicatorsByContractId = vi.fn<
      NonNullable<ContractsLocacoesReadClient['listBillingDetailIndicatorsByContractId']>
    >(async () => [{
      id: 'billing-1',
      sent_at: '2026-08-10T17:30:00.000Z',
      needs_resend: true,
      content_revision: '7',
      boleto_change_pending: true,
      boleto_change_operation_id: 'operation-1',
      boleto_change_started_at: '2026-08-10T18:00:00.000Z',
    }]);
    const listBillingDeliveryEvents = vi.fn<
      NonNullable<ContractsLocacoesReadClient['listBillingDeliveryEvents']>
    >(async () => [{
      id: 'event-1', organization_id: 'org-1', billing_cycle_id: 'billing-1',
      sent_at: '2026-08-10T17:30:00.000Z', recipients: ['financeiro@cliente.com'],
      provider_message_id: 'provider-1', send_request_id: '11111111-1111-4111-8111-111111111111',
      additional_message: null, created_by: 'user-1', created_at: '2026-08-10T17:30:01.000Z',
    } satisfies BillingDeliveryEvent]);
    const client: ContractsLocacoesReadClient = Object.assign(new FakeReadClient(), {
      listBillingDetailIndicatorsByContractId,
      listBillingDeliveryEvents,
    });

    const detail = await getContract(client, 'contract-1');

    expect(listBillingDetailIndicatorsByContractId).toHaveBeenCalledWith('org-1', 'contract-1');
    expect(listBillingDeliveryEvents).toHaveBeenCalledWith('org-1', ['billing-1']);
    expect(detail.billingDeliveryEvents.map((event) => event.id)).toEqual(['event-1']);
    expect(detail.billingCycles[0]).toMatchObject({
      sent_at: '2026-08-10T17:30:00.000Z',
      needs_resend: true,
      content_revision: '7',
      boleto_change_pending: true,
      boleto_change_operation_id: 'operation-1',
    });
  });
});

function makeRentalItem(overrides: Partial<RentalItem> = {}): RentalItem {
  return {
    id: 'item-1',
    organization_id: 'org-1',
    contract_id: 'contract-1',
    asset_id: null,
    description: 'Transformador',
    equipment_type: 'Transformador',
    capacity: '500 kVA',
    serial_number: 'ABC123',
    internal_code: '',
    quantity: 1,
    unit_amount: '150000',
    status: 'rented',
    returned_at: null,
    future_inventory_item_id: null,
    created_at: '2026-08-08T00:00:00.000Z',
    updated_at: '2026-08-08T00:00:00.000Z',
    ...overrides,
  };
}
