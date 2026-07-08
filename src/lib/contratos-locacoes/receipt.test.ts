import { describe, expect, it } from 'vitest';
import { buildReceiptSnapshot } from './receipt';
import type { BillingCycle, BillingLine, Contract, Customer, CustomerSite, Payment, RentalItem } from './types';

describe('receipt snapshot builder', () => {
  it('builds a manual rental receipt with financial number, period, customer, site and items', () => {
    const snapshot = buildReceiptSnapshot({
      billing: makeBilling({
        document_number: null,
        sequence_number: 12,
      }),
      contract: makeContract({
        internal_number: '23',
        legacy_order_number: 'OS-2026-23',
      }),
      customer: makeCustomer(),
      site: makeSite(),
      rentalItems: [
        makeRentalItem({
          id: 'item-1',
          description: 'Gerador a diesel',
          equipment_type: 'Gerador',
          capacity: '150 kVA',
          quantity: 2,
          unit_amount: '75000',
        }),
      ],
      billingLines: [
        makeBillingLine({
          id: 'line-1',
          description: 'Locação mensal gerador 150 kVA',
          quantity: 2,
          unit_amount: '75000',
          total_amount: '150000',
        }),
      ],
      payments: [makePayment({ amount: '50000' })],
    });

    expect(snapshot.receiptNumber).toBe('R000023012');
    expect(snapshot.fileName).toBe('recibo-R000023012.pdf');
    expect(snapshot.customer.name).toBe('Cliente Exemplo Ltda');
    expect(snapshot.site.name).toBe('Obra Centro');
    expect(snapshot.contract.internalNumber).toBe('23');
    expect(snapshot.contract.legacyOrderNumber).toBe('OS-2026-23');
    expect(snapshot.period.label).toBe('01/07/2026 a 30/07/2026');
    expect(snapshot.totals.totalAmount).toBe('150000');
    expect(snapshot.totals.paidAmount).toBe('50000');
    expect(snapshot.totals.balanceAmount).toBe('100000');
    expect(snapshot.items[0]?.quantity).toBe(2);
    expect(snapshot.lines[0]?.totalAmountLabel).toBe('R$ 1.500,00');
  });

  it('preserves an existing receipt document number when it is already stored', () => {
    const snapshot = buildReceiptSnapshot({
      billing: makeBilling({
        document_number: 'R654321003',
        sequence_number: 3,
      }),
      contract: makeContract({
        internal_number: '77',
      }),
      customer: makeCustomer(),
      site: makeSite(),
      rentalItems: [],
      billingLines: [],
      payments: [],
    });

    expect(snapshot.receiptNumber).toBe('R654321003');
  });
});

function makeContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'contract-1',
    organization_id: 'org-1',
    internal_number: '23',
    kind: 'rental',
    contract_company: 'fontes',
    customer_id: 'customer-1',
    site_id: 'site-1',
    legacy_order_number: null,
    start_date: '2026-07-01',
    end_date: null,
    recurrence_days: 30,
    pricing_model: 'fixed',
    base_amount: '150000',
    percentage_rate: null,
    status: 'active',
    pause_started_at: null,
    pause_reason: null,
    notes: 'Cobrança mensal',
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeBilling(overrides: Partial<BillingCycle> = {}): BillingCycle {
  return {
    id: 'billing-1',
    organization_id: 'org-1',
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
    total_amount: '150000',
    document_type: 'receipt',
    document_number: null,
    status: 'issued',
    notes: 'Recibo mensal',
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'customer-1',
    organization_id: 'org-1',
    legal_name: 'Cliente Exemplo Ltda',
    trade_name: 'Cliente Exemplo',
    tax_id: '12345678000199',
    state_registration: null,
    municipal_registration: null,
    notes: null,
    active: true,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeSite(overrides: Partial<CustomerSite> = {}): CustomerSite {
  return {
    id: 'site-1',
    organization_id: 'org-1',
    customer_id: 'customer-1',
    name: 'Obra Centro',
    address_line: 'Rua das Flores',
    number: '120',
    complement: null,
    district: 'Centro',
    city: 'Curitiba',
    state: 'PR',
    postal_code: '80000-000',
    notes: null,
    active: true,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeRentalItem(overrides: Partial<RentalItem> = {}): RentalItem {
  return {
    id: 'item-1',
    organization_id: 'org-1',
    contract_id: 'contract-1',
    description: 'Gerador a diesel',
    equipment_type: 'Gerador',
    capacity: '150 kVA',
    serial_number: 'SER-1',
    internal_code: 'GER-1',
    quantity: 1,
    unit_amount: '150000',
    status: 'rented',
    future_inventory_item_id: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeBillingLine(overrides: Partial<BillingLine> = {}): BillingLine {
  return {
    id: 'line-1',
    organization_id: 'org-1',
    billing_cycle_id: 'billing-1',
    rental_item_id: 'item-1',
    description: 'Locação mensal gerador 150 kVA',
    quantity: 1,
    unit_amount: '150000',
    total_amount: '150000',
    kind: 'recurring',
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'payment-1',
    organization_id: 'org-1',
    billing_cycle_id: 'billing-1',
    paid_at: '2026-07-15',
    amount: '50000',
    notes: null,
    created_at: '2026-07-15T00:00:00.000Z',
    updated_at: '2026-07-15T00:00:00.000Z',
    ...overrides,
  };
}
