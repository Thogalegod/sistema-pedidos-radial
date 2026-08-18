import { describe, expect, it } from 'vitest';
import { buildRentalInvoiceSnapshot as buildReceiptSnapshot } from './rental-invoice';
import type { BillingCycle, BillingLine, Contract, Customer, CustomerSite, Payment, RentalItem } from './types';

describe('rental invoice snapshot builder', () => {
  it('builds a rental invoice with its commercial and historical billing data', () => {
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

    expect(snapshot.invoiceNumber).toBe('R000023012');
    expect(snapshot.fileName).toBe('fatura-R000023012.pdf');
    expect(snapshot.company.legalName).toBe('FONTES ENERGIA COMÉRCIO E MANUTENÇÃO LTDA');
    expect(snapshot.company.banking.account).toBe('06.339-0');
    expect(snapshot.customer.name).toBe('Cliente Exemplo Ltda');
    expect(snapshot.customer.stateRegistration).toBeNull();
    expect(snapshot.site.name).toBe('Obra Centro');
    expect(snapshot.contract.legacyOrderNumber).toBe('OS-2026-23');
    expect(snapshot.period.label).toBe('01/07/2026 a 30/07/2026');
    expect(snapshot.totals.totalAmount).toBe('150000');
    expect(snapshot.totals.totalAmountInWords).toBe('Mil e quinhentos reais');
    expect(snapshot.lines[0]?.totalAmountLabel).toBe('R$ 1.500,00');
    expect(snapshot.remittanceInvoice).toBeNull();
  });

  it('preserves an existing invoice document number when it is already stored', () => {
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

    expect(snapshot.invoiceNumber).toBe('R654321003');
  });

  it('shows the historical billing line price after the current rental item price changes', () => {
    const snapshot = buildReceiptSnapshot({
      billing: makeBilling({ total_amount: '300000', base_amount: '300000' }),
      contract: makeContract(),
      customer: makeCustomer(),
      site: makeSite(),
      rentalItems: [makeRentalItem({ id: 'item-1', unit_amount: '350000' })],
      billingLines: [makeBillingLine({
        rental_item_id: 'item-1',
        unit_amount: '300000',
        total_amount: '300000',
      })],
      payments: [],
    });

    expect(snapshot.lines[0]?.unitAmountLabel).toBe('R$ 3.000,00');
    expect(snapshot.lines[0]?.totalAmountLabel).toBe('R$ 3.000,00');
  });

  it('shows the remittance invoice only when the contract enables it and has a number', () => {
    const visibleSnapshot = buildReceiptSnapshot({
      billing: makeBilling(),
      contract: makeContract({
        has_remittance_invoice: true,
        remittance_invoice_number: '476',
        remittance_invoice_issue_date: '2026-06-29',
      }),
      customer: makeCustomer(),
      site: makeSite(),
      rentalItems: [],
      billingLines: [makeBillingLine()],
      payments: [],
    });
    const hiddenSnapshot = buildReceiptSnapshot({
      billing: makeBilling(),
      contract: makeContract({
        has_remittance_invoice: false,
        remittance_invoice_number: '476',
      }),
      customer: makeCustomer(),
      site: makeSite(),
      rentalItems: [],
      billingLines: [makeBillingLine()],
      payments: [],
    });

    expect(visibleSnapshot.remittanceInvoice).toEqual({ number: '476', issueDateLabel: '29/06/2026' });
    expect(hiddenSnapshot.remittanceInvoice).toBeNull();
  });

  it('preserves the billing cycle adjustments without recalculating them', () => {
    const snapshot = buildReceiptSnapshot({
      billing: makeBilling({
        base_amount: '400000',
        discount_amount: '10000',
        surcharge_amount: '25000',
        exemption_amount: '15000',
        total_amount: '400000',
      }),
      contract: makeContract({ contract_company: 'radial' }),
      customer: makeCustomer(),
      site: makeSite(),
      rentalItems: [],
      billingLines: [makeBillingLine({ total_amount: '400000' })],
      payments: [],
    });

    expect(snapshot.company.banking.account).toBe('63.881-1');
    expect(snapshot.totals).toMatchObject({
      baseAmount: '400000',
      discountAmount: '10000',
      surchargeAmount: '25000',
      exemptionAmount: '15000',
      totalAmount: '400000',
    });
  });

  it('uses the rental observation when the billing note is blank', () => {
    const snapshot = buildReceiptSnapshot({
      billing: makeBilling({ notes: '   ' }),
      contract: makeContract({ notes: 'Equipamento instalado na área externa.' }),
      customer: makeCustomer(),
      site: makeSite(),
      billingLines: [makeBillingLine()],
      payments: [],
    });

    expect(snapshot.notes).toBe('Equipamento instalado na área externa.');
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
    sent_at: null,
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
      asset_id: null,
      description: 'Gerador a diesel',
      equipment_type: 'Gerador',
      capacity: '150 kVA',
    serial_number: 'SER-1',
    internal_code: 'GER-1',
    quantity: 1,
    unit_amount: '150000',
    status: 'rented',
    returned_at: null,
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
