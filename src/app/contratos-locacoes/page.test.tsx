import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Page from './page';
import { createBillingSnapshot } from '@/lib/contratos-locacoes/dashboard';

const mocks = vi.hoisted(() => ({ dashboard: vi.fn(), contracts: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/contratos-locacoes/queries', () => ({
  createSupabaseContractsLocacoesReadClient: () => ({}),
  getDashboardSnapshot: mocks.dashboard, listContracts: mocks.contracts,
}));
beforeEach(() => {
  mocks.dashboard.mockReset().mockResolvedValue(createBillingSnapshot('2026-11-14', []));
  mocks.contracts.mockReset().mockResolvedValue([]);
});
afterEach(cleanup);

it('replaces loading with a safe persistent error and recovers after retry', async () => {
  mocks.dashboard.mockRejectedValueOnce(new Error('internal database relation and query details'));
  render(<Page />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar o painel');
  expect(screen.queryByText('Carregando painel...')).not.toBeInTheDocument();
  expect(screen.queryByText(/internal database/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(await screen.findByText('Saldo em aberto')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('handles a contract-query failure without presenting an empty financial dashboard', async () => {
  mocks.contracts.mockRejectedValueOnce(new Error('network error'));
  render(<Page />);
  await screen.findByRole('alert');
  expect(screen.queryByText('Saldo em aberto')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await screen.findByText('Saldo em aberto');
});

it('ignores a response after unmount', async () => {
  let resolve!: (value: ReturnType<typeof createBillingSnapshot>) => void;
  mocks.dashboard.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const view = render(<Page />);
  view.unmount();
  resolve(createBillingSnapshot('2026-11-14', []));
  await waitFor(() => expect(screen.queryByText('Saldo em aberto')).not.toBeInTheDocument());
});
