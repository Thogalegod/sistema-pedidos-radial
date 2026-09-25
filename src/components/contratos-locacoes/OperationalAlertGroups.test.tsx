import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { BillingAlertItem } from '@/lib/contratos-locacoes/dashboard';
import type { ContractListItem } from '@/lib/contratos-locacoes/queries';
import { OperationalAlertGroups } from './OperationalAlertGroups';

afterEach(cleanup);

const overdue = (id: number): BillingAlertItem => ({
  id: `billing-${id}`,
  contract_id: `contract-${id}`,
  internal_number: String(id),
  customer_name: `Cliente ${id}`,
  site_name: 'Obra',
  legacy_order_number: `OS-${id}`,
  document_number: null,
  total_amount: '10000',
  paid_amount: '0',
  balance_amount: '10000',
  due_date: '2026-09-01',
  issue_date: '2026-08-01',
  status: 'overdue',
  level: 'overdue',
});

describe('OperationalAlertGroups', () => {
  it('caps each group at four items and links to the full all-month population', () => {
    render(<OperationalAlertGroups alerts={[1, 2, 3, 4, 5].map(overdue)} contracts={[]} />);

    const group = screen.getByRole('region', { name: 'Cobranças vencidas' });
    expect(within(group).getAllByRole('link')).toHaveLength(5);
    expect(within(group).queryByText('Cliente 5')).not.toBeInTheDocument();
    expect(within(group).getByRole('link', { name: 'Ver todas as 5 →' })).toHaveAttribute(
      'href', '/contratos-locacoes/cobrancas?status=overdue&month=all'
    );
    expect(within(group).getAllByText('Venceu em 01/09/2026')).toHaveLength(4);
  });

  it('separates rental coverage from billing alerts', () => {
    const contract = {
      id: 'contract-period',
      kind: 'rental',
      status: 'active',
      billing_coverage_status: 'first_period_required',
      internal_number: '26',
      legacy_order_number: 'OS-26',
      customer_name: 'Cliente pendente',
      site_name: 'Obra',
      current_monthly_amount: '20000',
      latest_billing_period_end: null,
    } as ContractListItem;
    render(<OperationalAlertGroups alerts={[]} contracts={[contract]} />);

    const group = screen.getByRole('region', { name: 'Períodos a emitir' });
    expect(within(group).getByRole('link', { name: /Cliente pendente/i })).toHaveAttribute(
      'href', '/contratos-locacoes/contratos/contract-period?action=new-billing'
    );
    expect(screen.queryByRole('region', { name: 'Cobranças vencidas' })).not.toBeInTheDocument();
  });
});
