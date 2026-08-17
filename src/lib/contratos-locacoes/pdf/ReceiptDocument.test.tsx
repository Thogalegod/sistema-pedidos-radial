// @vitest-environment node

import { renderToBuffer } from '@react-pdf/renderer';
import { describe, expect, it } from 'vitest';
import { ReceiptDocument } from './ReceiptDocument';
import { buildReceiptSnapshot } from '../receipt';
import type { BillingCycle, BillingLine, Contract, Customer, CustomerSite } from '../types';

describe('ReceiptDocument', () => {
  it('renders a receipt PDF buffer with the expected financial identification', async () => {
    const snapshot = buildReceiptSnapshot({
      billing: makeBilling(),
      contract: makeContract(),
      customer: makeCustomer(),
      site: makeSite(),
      rentalItems: [],
      billingLines: [makeBillingLine()],
      payments: [],
    });

    const buffer = await renderToBuffer(<ReceiptDocument snapshot={snapshot} />);
    const content = buffer.toString('latin1');

    expect(buffer.byteLength).toBeGreaterThan(1000);
    expect(content).toContain(snapshot.receiptNumber);
    expect(content).toContain('Radial Energia');
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

function makeBillingLine(overrides: Partial<BillingLine> = {}): BillingLine {
  return {
    id: 'line-1',
    organization_id: 'org-1',
    billing_cycle_id: 'billing-1',
    rental_item_id: null,
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
