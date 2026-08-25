'use client';

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ContratosPage from './page';

const mocks = vi.hoisted(() => ({
  listContracts: vi.fn(),
  listCustomers: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    error: mocks.toastError,
  },
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

vi.mock('@/lib/contratos-locacoes/queries', () => ({
  createSupabaseContractsLocacoesReadClient: () => ({}),
  listContracts: mocks.listContracts,
  listCustomers: mocks.listCustomers,
}));

vi.mock('@/components/contratos-locacoes/ContractListCard', () => ({
  ContractListCard: ({ contract }: { contract: { id: string; customer_name: string } }) => (
    <article data-testid={`contract-card-${contract.id}`}>{contract.customer_name}</article>
  ),
}));

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listContracts.mockResolvedValue([]);
  mocks.listCustomers.mockResolvedValue([
    { id: 'customer-1', legal_name: 'Alpha Engenharia' },
    { id: 'customer-2', legal_name: 'Beta Construções' },
  ]);
});

describe('ContratosPage', () => {
  it('loads customer options and lists every customer contract by default', async () => {
    mocks.listContracts.mockResolvedValue([
      { id: 'contract-1', customer_name: 'Alpha Engenharia' },
      { id: 'contract-2', customer_name: 'Beta Construções' },
    ]);

    render(<ContratosPage />);

    const customerSelect = await screen.findByRole('combobox', { name: 'Cliente' });
    expect(within(customerSelect).getByRole('option', { name: 'Todos os clientes' })).toBeInTheDocument();
    expect(within(customerSelect).getByRole('option', { name: 'Alpha Engenharia' })).toBeInTheDocument();
    expect(within(customerSelect).getByRole('option', { name: 'Beta Construções' })).toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.listCustomers).toHaveBeenCalledWith(expect.anything(), { status: 'all' });
    });
    await waitFor(() => {
      expect(mocks.listContracts).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ customerId: undefined }),
        expect.anything()
      );
    });
    expect(await screen.findByTestId('contract-card-contract-1')).toBeInTheDocument();
    expect(screen.getByTestId('contract-card-contract-2')).toBeInTheDocument();
  });

  it('refetches contracts with the selected customer id', async () => {
    render(<ContratosPage />);

    const customerSelect = await screen.findByRole('combobox', { name: 'Cliente' });
    fireEvent.change(customerSelect, { target: { value: 'customer-2' } });

    await waitFor(() => {
      expect(mocks.listContracts).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ customerId: 'customer-2' }),
        expect.anything()
      );
    });

    fireEvent.change(customerSelect, { target: { value: '' } });

    await waitFor(() => {
      expect(mocks.listContracts).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ customerId: undefined }),
        expect.anything()
      );
    });
  });

  it('keeps rendering contracts when loading customer options fails', async () => {
    mocks.listCustomers.mockRejectedValue(new Error('Falha ao carregar clientes'));
    mocks.listContracts.mockResolvedValue([
      { id: 'contract-1', customer_name: 'Alpha Engenharia' },
    ]);

    render(<ContratosPage />);

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('Falha ao carregar clientes');
    });

    expect(await screen.findByTestId('contract-card-contract-1')).toBeInTheDocument();

    const customerSelect = screen.getByRole('combobox', { name: 'Cliente' });
    expect(within(customerSelect).getAllByRole('option')).toHaveLength(1);
    expect(within(customerSelect).getByRole('option', { name: 'Todos os clientes' })).toBeInTheDocument();
  });
});
