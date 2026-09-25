import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBillingCompanyProfile } from './company';
import type { RentalInvoiceSnapshot } from './rental-invoice';

const { renderToBuffer } = vi.hoisted(() => ({ renderToBuffer: vi.fn() }));
vi.mock('@react-pdf/renderer', async () => {
  const actual = await vi.importActual<typeof import('@react-pdf/renderer')>('@react-pdf/renderer');
  return { ...actual, renderToBuffer };
});

import { RentalInvoiceDocument } from './pdf/RentalInvoiceDocument';
import {
  buildCanonicalRentalInvoiceContent,
  computeBoletoBytesGuard,
  computeCanonicalRentalInvoiceGuard,
  prepareBillingAttachments,
  renderRentalInvoiceBuffer,
} from './billing-email-attachments.server';

function snapshot(overrides: Partial<RentalInvoiceSnapshot> = {}): RentalInvoiceSnapshot {
  return {
    invoiceNumber: 'R000008001', fileName: 'fatura-R000008001.pdf',
    issuedAtLabel: '01/08/2026', dueAtLabel: '31/08/2026',
    period: { start: '2026-08-01', end: '2026-08-31', label: '01/08/2026 a 31/08/2026', sequenceNumber: 1 },
    company: getBillingCompanyProfile('fontes'),
    contract: { id: 'contract-1', internalNumber: '8', legacyOrderNumber: null, kind: 'rental', notes: null },
    customer: { name: 'Cliente Exemplo', tradeName: 'Cliente', taxId: null, stateRegistration: null },
    site: { name: 'Obra Norte', addressLabel: 'Rua Um, 10' }, remittanceInvoice: null,
    lines: [
      { id: 'line-b', description: 'Linha B', quantity: 1, kind: 'recurring', unitAmountLabel: 'R$ 10,00', totalAmountLabel: 'R$ 10,00' },
      { id: 'line-a', description: 'Linha A', quantity: 2, kind: 'damage', unitAmountLabel: 'R$ 20,00', totalAmountLabel: 'R$ 40,00' },
    ],
    totals: {
      baseAmount: '5000', discountAmount: '0', surchargeAmount: '0', exemptionAmount: '0', totalAmount: '5000',
      baseAmountLabel: 'R$ 50,00', discountAmountLabel: 'R$ 0,00', surchargeAmountLabel: 'R$ 0,00', exemptionAmountLabel: 'R$ 0,00',
      totalAmountLabel: 'R$ 50,00', totalAmountInWords: 'cinquenta reais',
    },
    financialStatus: { paidAmount: '0', balanceAmount: '5000', paidAmountLabel: 'R$ 0,00', balanceAmountLabel: 'R$ 50,00' },
    notes: null,
    ...overrides,
  };
}

describe('billing email attachments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    renderToBuffer.mockResolvedValue(Buffer.from('single-invoice-buffer'));
  });

  it('renders the approved invoice document exactly once and returns that buffer', async () => {
    const current = snapshot();
    const result = await renderRentalInvoiceBuffer(current);

    expect(renderToBuffer).toHaveBeenCalledTimes(1);
    const element = renderToBuffer.mock.calls[0][0];
    expect(element.type).toBe(RentalInvoiceDocument);
    expect(element.props.snapshot).toBe(current);
    expect(result).toBe(await renderToBuffer.mock.results[0].value);
  });

  it('canonicalizes only rendered content and preserves row order', () => {
    const current = snapshot();
    const content = buildCanonicalRentalInvoiceContent(current);

    expect(content[8]).toEqual([
      ['1', 'Linha B', 'R$ 10,00', 'R$ 10,00'],
      ['2', 'Linha A', 'R$ 20,00', 'R$ 40,00'],
    ]);
    const initial = computeCanonicalRentalInvoiceGuard(content);
    const paymentsChanged = snapshot({
      financialStatus: { paidAmount: '5000', balanceAmount: '0', paidAmountLabel: 'R$ 50,00', balanceAmountLabel: 'R$ 0,00' },
    });
    expect(computeCanonicalRentalInvoiceGuard(buildCanonicalRentalInvoiceContent(paymentsChanged))).toBe(initial);

    const reordered = snapshot({ lines: [...current.lines].reverse() });
    expect(computeCanonicalRentalInvoiceGuard(buildCanonicalRentalInvoiceContent(reordered))).not.toBe(initial);
    const changed = snapshot({ customer: { ...current.customer, name: 'Outro cliente' } });
    expect(computeCanonicalRentalInvoiceGuard(buildCanonicalRentalInvoiceContent(changed))).not.toBe(initial);
  });

  it('hashes boleto bytes independently', () => {
    expect(computeBoletoBytesGuard(new Uint8Array([1, 2, 3]))).toBe(
      '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81'
    );
    expect(computeBoletoBytesGuard(new Uint8Array([1, 2, 4]))).not.toBe(
      computeBoletoBytesGuard(new Uint8Array([1, 2, 3]))
    );
  });

  it('prepares both filenames, guards and the single rendered invoice buffer', async () => {
    const invoice = Buffer.from('single-invoice-buffer');
    renderToBuffer.mockResolvedValue(invoice);
    const boletoBytes = Uint8Array.from([37, 80, 68, 70]).buffer;

    const prepared = await prepareBillingAttachments({
      snapshot: snapshot(), boletoBytes, billingCycleId: 'billing-1',
    });

    expect(renderToBuffer).toHaveBeenCalledTimes(1);
    expect(prepared.invoice).toBe(invoice);
    expect(prepared.invoiceFileName).toBe('fatura-R000008001.pdf');
    expect(prepared.boleto).toEqual(Buffer.from(boletoBytes));
    expect(prepared.boletoFileName).toBe('boleto-billing-1.pdf');
    expect(prepared.invoiceSemanticGuard).toMatch(/^[a-f0-9]{64}$/);
    expect(prepared.boletoBytesGuard).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects attachments whose combined base64 payload exceeds 40 MB', async () => {
    renderToBuffer.mockResolvedValue(Buffer.alloc(21 * 1024 * 1024));
    const boleto = new Uint8Array(10 * 1024 * 1024).buffer;
    await expect(prepareBillingAttachments({
      snapshot: snapshot(), boletoBytes: boleto, billingCycleId: 'billing-1',
    })).rejects.toThrow(/40 MB/i);
  });
});
