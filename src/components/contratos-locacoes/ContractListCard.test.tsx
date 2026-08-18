import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ContractListItem } from '@/lib/contratos-locacoes/queries';
import { ContractListCard } from './ContractListCard';

afterEach(cleanup);

describe('ContractListCard', () => {
  it('prioritizes customer, raw order and site without exposing the internal number', () => {
    render(<ContractListCard contract={makeContract()} />);

    const card = screen.getByRole('link', { name: /Cliente QA/i });
    expect(within(card).getByRole('heading', { level: 2, name: 'Cliente QA' })).toBeInTheDocument();
    expect(within(card).getByText('1111fsd')).toBeInTheDocument();
    expect(within(card).queryByText(/Pedido 1111fsd/i)).not.toBeInTheDocument();
    expect(within(card).getByText('Obra QA')).toBeInTheDocument();
    expect(within(card).getByText('Locação')).toBeInTheDocument();
    expect(within(card).getByText('Ativa')).toBeInTheDocument();
    expect(within(card).queryByText(/Locação interna|#26/i)).not.toBeInTheDocument();
  });

  it('does not resurrect the internal number when a historical rental has no order', () => {
    render(<ContractListCard contract={makeContract({ legacy_order_number: null, internal_number: '27' })} />);

    const card = screen.getByRole('link', { name: /Cliente QA/i });
    expect(within(card).getByRole('heading', { level: 2, name: 'Cliente QA' })).toBeInTheDocument();
    expect(within(card).getByText('Obra QA')).toBeInTheDocument();
    expect(within(card).queryByText(/Locação interna|Locação #27|#27/i)).not.toBeInTheDocument();
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
    ...overrides,
  };
}
