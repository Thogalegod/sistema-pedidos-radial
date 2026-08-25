'use client';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CobrancasPage from './page';

const mocks = vi.hoisted(() => ({
  getCurrentOrganizationId: vi.fn(),
  getCurrentOrganizationMembership: vi.fn(),
  listBillings: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/contratos-locacoes/cobrancas',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('month=2026-08'),
}));

vi.mock('react-hot-toast', () => ({
  default: { error: mocks.toastError },
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

vi.mock('@/lib/contratos-locacoes/queries', () => ({
  canManageBilling: (membership: { role: string; can_manage_billing: boolean }) =>
    membership.role === 'admin' || membership.can_manage_billing,
  createSupabaseContractsLocacoesReadClient: () => ({
    getCurrentOrganizationId: mocks.getCurrentOrganizationId,
    getCurrentOrganizationMembership: mocks.getCurrentOrganizationMembership,
  }),
  listBillings: mocks.listBillings,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentOrganizationId.mockResolvedValue('org-1');
  mocks.listBillings.mockResolvedValue([makeBilling()]);
});

afterEach(cleanup);

describe('CobrancasPage billing delivery visibility', () => {
  it('shows delivery indicators to an authorized billing manager', async () => {
    mocks.getCurrentOrganizationMembership.mockResolvedValue({
      organization_id: 'org-1',
      user_id: 'user-1',
      role: 'member',
      can_manage_billing: true,
      created_at: '',
    });

    render(<CobrancasPage />);

    expect(await screen.findByText('Boleto anexado')).toBeInTheDocument();
    expect(screen.getByText(/Enviada em/i)).toBeInTheDocument();
    expect(mocks.listBillings).toHaveBeenCalledOnce();
  });

  it('fails closed and hides delivery indicators from a common member', async () => {
    mocks.getCurrentOrganizationMembership.mockResolvedValue({
      organization_id: 'org-1',
      user_id: 'user-1',
      role: 'member',
      can_manage_billing: false,
      created_at: '',
    });

    render(<CobrancasPage />);

    await waitFor(() => expect(screen.queryByText('Carregando cobranças...')).not.toBeInTheDocument());
    expect(screen.queryByText(/Boleto (?:anexado|não anexado)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Enviada em|Não enviada/i)).not.toBeInTheDocument();
  });
});

function makeBilling() {
  return {
    id: 'billing-1',
    contract_id: 'contract-1',
    internal_number: '77',
    customer_name: 'Cliente QA',
    site_name: 'Obra QA',
    legacy_order_number: 'OS-QA-77',
    document_number: 'R000077001',
    document_type: 'receipt' as const,
    due_date: '2026-08-15',
    issue_date: '2026-08-08',
    period_start: '2026-08-08',
    period_end: '2026-09-07',
    delivery_indicators: {
      sent_at: '2026-08-10T17:30:00.000Z',
      needs_resend: false,
      has_boleto: true,
    },
    total_amount: '300000',
    paid_amount: '0',
    balance_amount: '300000',
    status: 'issued' as const,
    alert: 'ok' as const,
  };
}
