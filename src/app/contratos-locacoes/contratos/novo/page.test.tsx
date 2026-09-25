'use client';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NovoContratoPage from './page';

const mocks = vi.hoisted(() => ({
  createContract: vi.fn(),
  listCustomers: vi.fn(),
  push: vi.fn(),
  saveRemittanceInvoiceDocument: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

vi.mock('@/lib/contratos-locacoes/queries', () => ({
  createSupabaseContractsLocacoesReadClient: () => ({}),
  getCustomer: vi.fn(),
  listAvailableRentalAssets: vi.fn().mockResolvedValue([]),
  listCustomers: mocks.listCustomers,
}));

vi.mock('@/lib/contratos-locacoes/mutations', () => ({
  createContract: mocks.createContract,
  createSupabaseContractsLocacoesMutationClient: () => ({}),
}));

vi.mock('@/lib/contratos-locacoes/remittance-documents', () => ({
  createSupabaseContractsLocacoesRemittanceDocumentClient: () => ({}),
  saveRemittanceInvoiceDocument: mocks.saveRemittanceInvoiceDocument,
}));

vi.mock('@/components/contratos-locacoes/ContractForm', () => ({
  ContractForm: ({
    onSubmit,
  }: {
    onSubmit: (value: unknown, remittanceInvoiceFile: File | null) => Promise<void>;
  }) => (
    <button
      type="button"
      onClick={() => void onSubmit(
        { items: [] },
        new File(['pdf'], 'nf-remessa.pdf', { type: 'application/pdf' })
      )}
    >
      Criar locação de teste
    </button>
  ),
}));

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listCustomers.mockResolvedValue([]);
});

describe('NovoContratoPage', () => {
  it('keeps the created rental and explains how to retry when the remittance upload fails', async () => {
    mocks.createContract.mockResolvedValue({
      contract: { id: 'contract-1' },
      items: [],
    });
    mocks.saveRemittanceInvoiceDocument.mockRejectedValue(new Error('storage indisponível'));

    render(<NovoContratoPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Criar locação de teste' }));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        'Locação criada, mas não foi possível anexar a NF de remessa. Você poderá anexá-la novamente no detalhe da locação.'
      );
    });
    expect(mocks.push).toHaveBeenCalledWith('/contratos-locacoes/contratos/contract-1');
  });
});
