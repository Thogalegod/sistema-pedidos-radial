import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GlobalSearchDialog } from './CentralSearch';

const mocks = vi.hoisted(() => ({ searchCentral: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/central/search', () => ({
  createSupabaseCentralSearchReadClient: () => ({}),
  searchCentral: mocks.searchCentral,
}));

beforeEach(() => {
  mocks.searchCentral.mockReset();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

it('waits for the current term and hides results from a previous term', async () => {
  mocks.searchCentral.mockResolvedValueOnce({
    tasks: [],
    orders: [],
    customers: [{ id: 'customer-1', title: 'Cliente QA', detail: 'Cliente', href: '/contratos-locacoes/clientes/customer-1' }],
    contracts: [],
    billings: [],
  }).mockResolvedValueOnce({ tasks: [], orders: [], customers: [], contracts: [], billings: [] });

  render(<GlobalSearchDialog open onClose={vi.fn()} />);
  const input = screen.getByRole('searchbox', { name: 'Busca global' });

  fireEvent.change(input, { target: { value: 'QA' } });
  expect(screen.getByText('Buscando…')).toBeInTheDocument();
  expect(screen.queryByText('Nenhum resultado encontrado.')).not.toBeInTheDocument();
  expect(await screen.findByText('Cliente QA')).toBeInTheDocument();

  fireEvent.change(input, { target: { value: 'ZZ' } });
  expect(screen.getByText('Buscando…')).toBeInTheDocument();
  expect(screen.queryByText('Cliente QA')).not.toBeInTheDocument();
  expect(await screen.findByText('Nenhum resultado encontrado.')).toBeInTheDocument();
});
