import { describe, expect, it } from 'vitest';
import { getBillingCompanyProfile } from './company';
import type { RentalInvoiceSnapshot } from './rental-invoice';
import type { CustomerContact } from './types';
import {
  buildBillingEmailContent,
  buildBillingSender,
  buildDefaultRecipients,
  normalizeBillingRecipients,
  parseBillingSendRequest,
} from './billing-email';

const REQUEST_ID = '550e8400-e29b-41d4-a716-446655440000';

function contact(overrides: Partial<CustomerContact>): CustomerContact {
  return {
    id: 'contact-1', organization_id: 'org-1', customer_id: 'customer-1', site_id: null,
    name: 'Contato', job_title: null, department: null, phone: null, whatsapp: null,
    email: 'billing@example.com', is_primary: false, receives_billing: true,
    receives_technical: false, notes: null, created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z', ...overrides,
  };
}

function snapshot(): RentalInvoiceSnapshot {
  return {
    invoiceNumber: 'R000008001',
    fileName: 'fatura-R000008001.pdf',
    issuedAtLabel: '01/08/2026',
    dueAtLabel: '31/08/2026',
    period: { start: '2026-08-01', end: '2026-08-31', label: '01/08/2026 a 31/08/2026', sequenceNumber: 1 },
    company: getBillingCompanyProfile('fontes'),
    contract: { id: 'contract-1', internalNumber: '8', legacyOrderNumber: null, kind: 'rental', notes: null },
    customer: { name: 'Cliente Exemplo', tradeName: 'Cliente', taxId: null, stateRegistration: null },
    site: { name: 'Obra Norte', addressLabel: 'Rua Um, 10' },
    remittanceInvoice: null,
    lines: [{ id: 'line-1', description: 'Transformador', quantity: 1, kind: 'recurring', unitAmountLabel: 'R$ 1.234,56', totalAmountLabel: 'R$ 1.234,56' }],
    totals: {
      baseAmount: '123456', discountAmount: '0', surchargeAmount: '0', exemptionAmount: '0', totalAmount: '123456',
      baseAmountLabel: 'R$ 1.234,56', discountAmountLabel: 'R$ 0,00', surchargeAmountLabel: 'R$ 0,00', exemptionAmountLabel: 'R$ 0,00',
      totalAmountLabel: 'R$ 1.234,56', totalAmountInWords: 'mil duzentos e trinta e quatro reais e cinquenta e seis centavos',
    },
    financialStatus: { paidAmount: '999999', balanceAmount: '-876543', paidAmountLabel: 'R$ 9.999,99', balanceAmountLabel: '-R$ 8.765,43' },
    notes: null,
  };
}

describe('billing email domain', () => {
  it('normalizes, deduplicates and sorts recipients deterministically', () => {
    expect(normalizeBillingRecipients([
      ' ZETA@example.com ',
      'alpha@example.com',
      'zeta@EXAMPLE.com',
    ])).toEqual(['alpha@example.com', 'zeta@example.com']);
  });

  it('selects only valid contacts marked to receive billing', () => {
    expect(buildDefaultRecipients([
      contact({ id: 'a', email: ' Financeiro@Example.com ' }),
      contact({ id: 'b', email: 'invalid', receives_billing: true }),
      contact({ id: 'c', email: 'other@example.com', receives_billing: false }),
      contact({ id: 'd', email: null }),
    ])).toEqual(['financeiro@example.com']);
  });

  it('parses a strict intent and trims its message', () => {
    expect(parseBillingSendRequest({
      send_request_id: REQUEST_ID,
      recipients: [' Billing@example.com ', 'billing@EXAMPLE.com'],
      additional_message: '  Favor confirmar o recebimento.  ',
    })).toEqual({
      send_request_id: REQUEST_ID,
      recipients: ['billing@example.com'],
      additional_message: 'Favor confirmar o recebimento.',
    });
  });

  it.each([
    [{ send_request_id: 'not-v4', recipients: ['a@example.com'], additional_message: null }],
    [{ send_request_id: REQUEST_ID, recipients: [], additional_message: null }],
    [{ send_request_id: REQUEST_ID, recipients: ['invalid'], additional_message: null }],
    [{ send_request_id: REQUEST_ID, recipients: Array.from({ length: 51 }, (_, index) => `a${index}@example.com`), additional_message: null }],
    [{ send_request_id: REQUEST_ID, recipients: ['a@example.com'], additional_message: 'x'.repeat(2001) }],
    [{ send_request_id: REQUEST_ID, recipients: ['a@example.com'], additional_message: null, from: 'attacker@example.com' }],
  ])('rejects an invalid or expanded browser payload', (payload) => {
    expect(() => parseBillingSendRequest(payload)).toThrow();
  });

  it.each([
    ['fontes', 'Fontes Energia <radial@radialenergia.com.br>', 'Fontes Energia'],
    ['radial', 'Radial Equipamentos <radial@radialenergia.com.br>', 'Radial Equipamentos'],
  ] as const)('derives the approved %s sender', (company, from, signature) => {
    expect(buildBillingSender(company)).toEqual({
      from,
      replyTo: 'radial@radialenergia.com.br',
      signature,
    });
  });

  it('rejects an unknown company without a fallback', () => {
    expect(() => buildBillingSender('unknown' as never)).toThrow(/empresa/i);
  });

  it('builds approved HTML and text while escaping the additional message', () => {
    const content = buildBillingEmailContent({
      snapshot: snapshot(),
      additionalMessage: '<script>alert("x")</script> & confirmar',
      company: 'fontes',
      contacts: [],
      recipients: ['billing@example.com'],
    });

    expect(content.subject).toBe('Cobrança de locação – Fatura R000008001 – venc. 31/08/2026');
    for (const value of ['01/08/2026 a 31/08/2026', '31/08/2026', 'R$ 1.234,56', 'fatura', 'boleto', 'Radial Energia']) {
      expect(content.html).toContain(value);
      expect(content.text).toContain(value);
    }
    expect(content.html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; confirmar');
    expect(content.html).not.toContain('<script>');
    expect(content.text).toContain('<script>alert("x")</script> & confirmar');
    expect(content.html).not.toContain('R$ 9.999,99');
    expect(content.text).not.toContain('R$ 9.999,99');
  });

  it('greets the first name when the only recipient is a named billing contact', () => {
    const content = buildBillingEmailContent({
      snapshot: snapshot(), company: 'fontes', additionalMessage: null,
      contacts: [contact({ name: '  João da Silva  ', email: ' JOAO@example.com ' })],
      recipients: ['joao@example.com'],
    });

    expect(content.html).toContain('<p>Olá, João,</p>');
    expect(content.text).toMatch(/^Olá, João,/);
    expect(content.text).not.toContain('Cliente Exemplo');
  });

  it.each([
    {
      label: 'multiple billing contacts',
      contacts: [
        contact({ id: 'a', name: 'João da Silva', email: 'joao@example.com' }),
        contact({ id: 'b', name: 'Maria Souza', email: 'maria@example.com' }),
      ],
      recipients: ['joao@example.com', 'maria@example.com'],
    },
    {
      label: 'one billing contact plus a manual recipient',
      contacts: [contact({ name: 'João da Silva', email: 'joao@example.com' })],
      recipients: ['joao@example.com', 'extra@example.com'],
    },
  ])('uses a neutral greeting for $label', ({ contacts, recipients }) => {
    const content = buildBillingEmailContent({
      snapshot: snapshot(), company: 'fontes', additionalMessage: null, contacts, recipients,
    });

    expect(content.html).toContain('<p>Olá,</p>');
    expect(content.text).toMatch(/^Olá,/);
    expect(content.text).not.toMatch(/João|Maria/);
  });

  it.each([
    { label: 'no matching contact', contacts: [] },
    { label: 'blank contact name', contacts: [contact({ name: '   ' })] },
  ])('uses a neutral greeting with $label', ({ contacts }) => {
    const content = buildBillingEmailContent({
      snapshot: snapshot(), company: 'fontes', additionalMessage: null,
      contacts, recipients: ['billing@example.com'],
    });

    expect(content.html).toContain('<p>Olá,</p>');
    expect(content.text).toMatch(/^Olá,/);
  });

  it('omits the additional-message block when the field is blank', () => {
    const content = buildBillingEmailContent({
      snapshot: snapshot(), company: 'fontes', additionalMessage: '   ', contacts: [],
      recipients: ['billing@example.com'],
    });

    expect(content.html).not.toContain('Mensagem adicional:');
    expect(content.text).not.toContain('Mensagem adicional:');
  });

  it('keeps the standard period, due date and amount in a professional message', () => {
    const content = buildBillingEmailContent({
      snapshot: snapshot(), company: 'fontes', additionalMessage: null, contacts: [],
      recipients: ['billing@example.com'],
    });

    for (const value of ['01/08/2026 a 31/08/2026', '31/08/2026', 'R$ 1.234,56']) {
      expect(content.html).toContain(value);
      expect(content.text).toContain(value);
    }
    expect(content.text).toContain('Em caso de dúvidas, permanecemos à disposição.');
  });
});
