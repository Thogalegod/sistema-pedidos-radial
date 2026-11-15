import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ContractListItem } from '@/lib/contratos-locacoes/queries';
import { ContractListCard } from './ContractListCard';

afterEach(cleanup);

describe('ContractListCard', () => {
  it('prioritizes the order as the main reference and hides the internal rental number', () => {
    render(<ContractListCard contract={makeContract()} />);

    const card = screen.getByRole('article');
    expect(within(card).getByRole('heading', { level: 2, name: 'Cliente QA' })).toBeInTheDocument();
    expect(within(card).getByText('1111fsd · Obra QA')).toBeInTheDocument();
    expect(within(card).queryByText(/Pedido 1111fsd/i)).not.toBeInTheDocument();
    expect(within(card).getByText(/Início: 07\/08\/2026/)).toBeInTheDocument();
    expect(within(card).queryByText('Locação')).not.toBeInTheDocument();
    expect(within(card).getByText('Ativa')).toBeInTheDocument();
    expect(within(card).queryByText(/Locação interna/i)).not.toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /abrir locação/i })).toHaveAttribute(
      'href',
      '/contratos-locacoes/contratos/contract-1'
    );
  });

  it('formats the start date for non-rental contracts too', () => {
    render(<ContractListCard contract={makeContract({ kind: 'other' })} />);

    expect(screen.getByText(/Início: 07\/08\/2026/)).toBeInTheDocument();
  });

  it('falls back to the internal rental reference when a historical rental has no order', () => {
    render(<ContractListCard contract={makeContract({ legacy_order_number: null, internal_number: '27' })} />);

    const card = screen.getByRole('article');
    expect(within(card).getByRole('heading', { level: 2, name: 'Cliente QA' })).toBeInTheDocument();
    expect(within(card).getByText('Locação #27 · Obra QA')).toBeInTheDocument();
  });

  it('shows current monthly amount and requests a new period based on period_end, not due_date', () => {
    render(<ContractListCard contract={makeContract({
      current_monthly_amount: '300000',
      latest_billing_period_end: '2026-08-31',
      latest_billing_due_date: '2026-09-10',
      billing_coverage_status: 'new_period_required',
    })} />);

    const card = screen.getByRole('article');
    expect(within(card).getByText('R$ 3.000,00/mês')).toBeInTheDocument();
    expect(within(card).getByText('Faturado até: 31/08/2026')).toBeInTheDocument();
    expect(within(card).getByText('Vencimento: 10/09/2026')).toBeInTheDocument();
    expect(within(card).getByText('Período a emitir')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Emitir período' })).toHaveAttribute(
      'href',
      '/contratos-locacoes/contratos/contract-1?action=new-billing'
    );
    expect(within(card).queryByText(/Vencida/i)).not.toBeInTheDocument();
    expect(within(card).queryByText(/Recorrência:/i)).not.toBeInTheDocument();
  });

  it('shows the first-period prompt without a fictitious due date', () => {
    render(<ContractListCard contract={makeContract({
      latest_billing_period_end: null,
      latest_billing_due_date: null,
      billing_coverage_status: 'first_period_required',
    })} />);

    const card = screen.getByRole('article');
    expect(within(card).getByText('Nenhum período emitido')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Emitir período' })).toHaveAttribute(
      'href',
      '/contratos-locacoes/contratos/contract-1?action=new-billing'
    );
    expect(within(card).queryByText(/Vencimento:/i)).not.toBeInTheDocument();
  });

  it('shows a green current-period badge and no emission prompt for inactive rentals', () => {
    const { rerender } = render(<ContractListCard contract={makeContract({
      billing_coverage_status: 'current',
    })} />);

    expect(screen.getByText('Período vigente')).toBeInTheDocument();

    rerender(<ContractListCard contract={makeContract({
      status: 'paused',
      billing_coverage_status: null,
    })} />);

    const card = screen.getByRole('article');
    expect(within(card).queryByText(/Emitir (novo|1º) período/i)).not.toBeInTheDocument();
  });

  it('shows notes discreetly and preserves the rental status badge', () => {
    render(<ContractListCard contract={makeContract({
      status: 'paused',
      billing_coverage_status: null,
      notes: 'Cliente pede aviso antes da emissão mensal.',
    })} />);

    const card = screen.getByRole('article');
    expect(within(card).getByText('Pausada')).toBeInTheDocument();
    expect(within(card).getByLabelText('Possui observação interna')).toBeInTheDocument();
    expect(within(card).queryByText(/Cliente pede aviso/)).not.toBeInTheDocument();
  });

  it('shows billing urgency and open balance separately from period coverage', () => {
    render(<ContractListCard contract={makeContract()} billing={{
      id: 'billing-1', contract_id: 'contract-1', status: 'overdue', alert: 'overdue',
      balance_amount: '125000', paid_amount: '0', due_date: '2026-09-06',
    } as NonNullable<Parameters<typeof ContractListCard>[0]['billing']>} />);

    const card = screen.getByRole('article');
    expect(within(card).getByText('Vencida')).toBeInTheDocument();
    expect(within(card).getByText('Vencimento: 06/09/2026')).toBeInTheDocument();
    expect(within(card).getByText('Saldo: R$ 1.250,00')).toBeInTheDocument();
    expect(within(card).queryByText('Período a emitir')).not.toBeInTheDocument();
  });
});

function makeContract(overrides: Partial<ContractListItem> = {}): ContractListItem {
  return {
    id: 'contract-1',
    internal_number: '26',
    kind: 'rental',
    status: 'active',
    customer_name: 'Cliente QA',
    site_name: 'Obra QA',
    legacy_order_number: '1111fsd',
    start_date: '2026-08-07',
    recurrence_days: 30,
    item_count: 2,
    current_monthly_amount: '300000',
    latest_billing_period_end: '2026-08-31',
    latest_billing_due_date: '2026-09-10',
    billing_coverage_status: 'current',
    notes: null,
    ...overrides,
  };
}
