// @vitest-environment node

import { renderToBuffer } from '@react-pdf/renderer';
import { describe, expect, it } from 'vitest';
import { buildRentalInvoiceSnapshot as buildReceiptSnapshot } from '../rental-invoice';
import type { BillingCycle, BillingLine, Contract, Customer, CustomerSite } from '../types';

describe('RentalInvoiceDocument', () => {
  it('renders the approved customer-facing invoice content without operational payment data', async () => {
    const snapshot = buildReceiptSnapshot({
      billing: makeBilling({ base_amount: '300000', total_amount: '300000' }),
      contract: makeContract({
        has_remittance_invoice: true,
        remittance_invoice_number: '476',
      }),
      customer: makeCustomer(),
      site: makeSite(),
      rentalItems: [],
      billingLines: [
        makeBillingLine({
          id: 'line-1',
          rental_item_id: 'item-1',
          description: 'Transformador 500 kVA - Série ABC123',
        }),
        makeBillingLine({
          id: 'line-2',
          rental_item_id: 'item-2',
          description: 'Transformador 300 kVA - Série XYZ789',
        }),
      ],
      payments: [],
    });
    const pdfModule = await import('./ReceiptDocument') as typeof import('./ReceiptDocument') & {
      RentalInvoiceDocument?: (props: { snapshot: typeof snapshot }) => React.JSX.Element;
      buildRentalInvoiceDocumentContent?: (value: typeof snapshot) => unknown;
    };

    expect(pdfModule.buildRentalInvoiceDocumentContent).toBeTypeOf('function');
    expect(pdfModule.RentalInvoiceDocument).toBeTypeOf('function');
    const content = pdfModule.buildRentalInvoiceDocumentContent?.(snapshot) as {
      issuerLines: string[];
      recipientLines: string[];
      tableRows: Array<{ description: string }>;
      fiscalNotice: string;
    };
    const serializedContent = JSON.stringify(content);

    expect(serializedContent).toContain('FATURA DE LOCAÇÃO');
    expect(serializedContent).toContain('FONTES ENERGIA COMÉRCIO E MANUTENÇÃO LTDA');
    expect(serializedContent).toContain('13.318.529/0001-08');
    expect(content).toMatchObject({
      invoiceDataRows: expect.arrayContaining([{ label: 'NF de remessa', value: '476' }]),
    });
    expect(content.issuerLines).toEqual([
      'Estrada São Miguel Arcanjo, 140 · Veraneio Maracanã · Itaquaquecetuba/SP · CEP 08582-500',
      'CNPJ: 13.318.529/0001-08 · IE: 379.076.526.115',
      'Fone: (11) 2941-4775 · WhatsApp: (11) 99837-2639',
      'www.radialenergia.com.br · thomas@radialenergia.com.br',
    ]);
    expect(content.tableRows.map((row) => row.description)).toEqual([
      'Transformador 500 kVA - Série ABC123',
      'Transformador 300 kVA - Série XYZ789',
    ]);
    expect(content.recipientLines).not.toContain('Inscrição Estadual: 110.042.490.114');
    expect(serializedContent).toContain('R$ 3.000,00');
    expect(serializedContent).not.toContain('Locação mensal');
    expect(serializedContent).not.toContain('Banco Itaú');
    expect(serializedContent).not.toContain('06.339-0');
    expect(serializedContent).not.toContain('Agência:');
    expect(serializedContent).not.toContain('Conta corrente:');
    expect(serializedContent).not.toContain('Inscrição Municipal');
    expect(serializedContent).toContain('WhatsApp: (11) 99837-2639');
    expect(serializedContent).not.toContain('9.9837-2639');
    expect(serializedContent).toContain('www.radialenergia.com.br');
    expect(serializedContent).toContain('thomas@radialenergia.com.br');
    expect(content).not.toHaveProperty('paymentLines');
    expect(content.fiscalNotice).toBe(
      'OPERAÇÃO NÃO SUJEITA A NOTA FISCAL DE SERVIÇOS NOS TERMOS DA LEI COMPLEMENTAR 116/2003 DE 01/08/2021'
    );
    expect(serializedContent).not.toContain('Recibo de Locação');
    expect(serializedContent).not.toContain('Pago');
    expect(serializedContent).not.toContain('Saldo em aberto');
    expect(serializedContent).not.toContain('Locação interna');
    expect(serializedContent).not.toContain('Gerado em');

    const RentalInvoiceDocument = pdfModule.RentalInvoiceDocument!;
    const buffer = await renderToBuffer(<RentalInvoiceDocument snapshot={snapshot} />);
    expect(buffer.byteLength).toBeGreaterThan(1000);
  });

  it('uses the compact Radial issuer header with institutional contacts and no bank data or IM', async () => {
    const snapshot = buildReceiptSnapshot({
      billing: makeBilling(),
      contract: makeContract({ contract_company: 'radial' }),
      customer: makeCustomer(),
      site: makeSite(),
      rentalItems: [],
      billingLines: [makeBillingLine()],
      payments: [],
    });
    const pdfModule = await import('./ReceiptDocument') as typeof import('./ReceiptDocument') & {
      buildRentalInvoiceDocumentContent?: (value: typeof snapshot) => unknown;
    };
    const content = pdfModule.buildRentalInvoiceDocumentContent?.(snapshot) as { issuerLines: string[] };
    const serializedContent = JSON.stringify(content);

    expect(serializedContent).toContain('RADIAL EQUIPAMENTOS ELÉTRICOS LTDA - ME');
    expect(serializedContent).toContain('11.215.564/0001-68');
    expect(content.issuerLines).toEqual([
      'R. Maracatuba, 1A · Chácara Califórnia · São Paulo/SP · CEP 03404-130',
      'CNPJ: 11.215.564/0001-68 · IE: 148.827.040.110',
      'Fone: (11) 2941-4775 · WhatsApp: (11) 99837-2639',
      'www.radialenergia.com.br · thomas@radialenergia.com.br',
    ]);
    expect(serializedContent).not.toContain('63.881-1');
    expect(serializedContent).not.toContain('Inscrição Municipal');
  });

  it('shows the customer state registration only when it is informed', async () => {
    const pdfModule = await import('./ReceiptDocument') as typeof import('./ReceiptDocument') & {
      buildRentalInvoiceDocumentContent?: (value: ReturnType<typeof buildReceiptSnapshot>) => unknown;
    };
    const buildContent = (stateRegistration: string | null) => {
      const snapshot = buildReceiptSnapshot({
        billing: makeBilling(),
        contract: makeContract(),
        customer: makeCustomer({ state_registration: stateRegistration }),
        site: makeSite(),
        billingLines: [makeBillingLine()],
        payments: [],
      });
      return pdfModule.buildRentalInvoiceDocumentContent?.(snapshot) as { recipientLines: string[] };
    };

    expect(buildContent('110.042.490.114').recipientLines).toContain(
      'CNPJ/CPF: 12345678000199 · IE: 110.042.490.114'
    );
    expect(buildContent(null).recipientLines).toContain('CNPJ/CPF: 12345678000199');
    expect(buildContent(null).recipientLines.some((line) => line.includes(' · IE:'))).toBe(false);
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
    needs_resend: false,
    content_revision: '0',
    boleto_change_pending: false,
    boleto_change_operation_id: null,
    boleto_change_started_at: null,
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
