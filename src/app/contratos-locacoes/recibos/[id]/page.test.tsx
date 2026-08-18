import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RentalInvoiceSnapshot } from '@/lib/contratos-locacoes/rental-invoice';

const { getBillingRentalInvoiceMock } = vi.hoisted(() => ({
  getBillingRentalInvoiceMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'billing-1' }),
}));

vi.mock('@react-pdf/renderer', () => ({
  PDFDownloadLink: ({ children, fileName }: {
    children: ReactNode | ((state: { loading: boolean }) => ReactNode);
    fileName: string;
  }) => (
    <a download={fileName} href="#pdf">
      {typeof children === 'function' ? children({ loading: false }) : children}
    </a>
  ),
}));

vi.mock('@/lib/contratos-locacoes/pdf/RentalInvoiceDocument', () => ({
  RentalInvoiceDocument: () => null,
}));

vi.mock('@/lib/contratos-locacoes/queries', () => ({
  createSupabaseContractsLocacoesReadClient: () => ({}),
  getBillingRentalInvoice: getBillingRentalInvoiceMock,
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import BillingReceiptPage from './page';

describe('BillingReceiptPage', () => {
  beforeEach(() => {
    getBillingRentalInvoiceMock.mockReset();
    getBillingRentalInvoiceMock.mockResolvedValue(makeSnapshot());
  });

  it('presents the billing document as the single rental invoice', async () => {
    render(<BillingReceiptPage />);

    expect(await screen.findByRole('heading', { name: 'Fatura R000008001' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Baixar fatura em PDF' })).toHaveAttribute(
      'download',
      'fatura-R000008001.pdf'
    );
    expect(screen.getByRole('heading', { name: 'Dados da fatura' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Situação financeira' })).toBeInTheDocument();
    expect(screen.getByText('Recebido')).toBeInTheDocument();
    expect(screen.queryByText(/recibo/i)).not.toBeInTheDocument();
  });
});

function makeSnapshot(): RentalInvoiceSnapshot {
  return {
    invoiceNumber: 'R000008001',
    fileName: 'fatura-R000008001.pdf',
    issuedAtLabel: '08/08/2026',
    dueAtLabel: '15/08/2026',
    period: {
      start: '2026-08-08',
      end: '2026-09-07',
      label: '08/08/2026 a 07/09/2026',
      sequenceNumber: 1,
    },
    company: {
      key: 'fontes',
      legalName: 'FONTES ENERGIA COMÉRCIO E MANUTENÇÃO LTDA',
      taxId: '13.318.529/0001-08',
      stateRegistration: '379.076.526.115',
      municipalRegistration: '35.2.2520868-6',
      address: [],
      contacts: [],
      banking: { bank: 'Banco Itaú', agency: '0709', account: '06.339-0' },
    },
    contract: {
      id: 'contract-1',
      internalNumber: '8',
      legacyOrderNumber: '20260807',
      kind: 'rental',
      notes: null,
    },
    customer: {
      name: 'Cliente Exemplo Ltda',
      tradeName: 'Cliente Exemplo',
      taxId: '12.345.678/0001-99',
      stateRegistration: null,
    },
    site: { name: 'Obra Centro', addressLabel: 'Rua Exemplo, 100' },
    remittanceInvoice: null,
    lines: [],
    totals: {
      baseAmount: '300000',
      discountAmount: '0',
      surchargeAmount: '0',
      exemptionAmount: '0',
      totalAmount: '300000',
      baseAmountLabel: 'R$ 3.000,00',
      discountAmountLabel: 'R$ 0,00',
      surchargeAmountLabel: 'R$ 0,00',
      exemptionAmountLabel: 'R$ 0,00',
      totalAmountLabel: 'R$ 3.000,00',
      totalAmountInWords: 'Três mil reais',
    },
    financialStatus: {
      paidAmount: '100000',
      balanceAmount: '200000',
      paidAmountLabel: 'R$ 1.000,00',
      balanceAmountLabel: 'R$ 2.000,00',
    },
    notes: null,
  };
}
