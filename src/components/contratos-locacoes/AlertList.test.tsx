import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AlertList } from './AlertList';

afterEach(cleanup);

describe('AlertList', () => {
  it('shows billing due dates in Brazilian format', () => {
    render(<AlertList alerts={[{
      id: 'billing-1',
      contract_id: 'contract-1',
      internal_number: '42',
      customer_name: 'Cliente QA',
      site_name: 'Obra QA',
      legacy_order_number: null,
      document_number: null,
      total_amount: '10000',
      paid_amount: '0',
      balance_amount: '10000',
      due_date: '2026-09-06',
      issue_date: '2026-08-06',
      status: 'issued',
      level: 'due_soon',
    }]} />);

    expect(screen.getByText('Vence em 06/09/2026')).toBeInTheDocument();
    expect(screen.queryByText(/2026-09-06/)).not.toBeInTheDocument();
  });
});
