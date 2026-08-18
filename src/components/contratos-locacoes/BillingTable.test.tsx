import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BillingTable } from './BillingTable';
import type { BillingListItem } from '@/lib/contratos-locacoes/queries';

describe('BillingTable', () => {
  it('shows consolidated billing period, sent state, paid amount and balance', () => {
    render(<BillingTable loading={false} billings={[makeBilling()]} />);

    const card = screen.getByRole('article');
    expect(within(card).getByRole('heading', { level: 2, name: 'R000077001' })).toBeInTheDocument();
    expect(within(card).getByText('Cliente QA · Pedido OS-QA-77')).toBeInTheDocument();
    expect(within(card).queryByText(/Locação interna #77/i)).not.toBeInTheDocument();
    expect(within(card).getByText('Obra QA')).toBeInTheDocument();
    expect(within(card).getByText('Parcialmente paga')).toBeInTheDocument();
    expect(within(card).getByText('R$ 3.000,00')).toBeInTheDocument();
    expect(within(card).getByText('Período: 08/08/2026–07/09/2026')).toBeInTheDocument();
    expect(within(card).getByText('Vence: 15/08/2026')).toBeInTheDocument();
    expect(within(card).getByText(/Enviado em/i)).toBeInTheDocument();
    expect(within(card).getByText(/Recebido: R\$ 1\.000,00/i)).toBeInTheDocument();
    expect(within(card).getByText(/Saldo: R\$ 2\.000,00/i)).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /abrir locação/i })).toHaveAttribute('href', '/contratos-locacoes/contratos/contract-1');
    expect(within(card).getByRole('link', { name: /abrir recibo/i })).toHaveAttribute('href', '/contratos-locacoes/recibos/billing-1');
  });
});

function makeBilling(overrides: Partial<BillingListItem> = {}): BillingListItem {
  return {
    id: 'billing-1',
    contract_id: 'contract-1',
    internal_number: '77',
    customer_name: 'Cliente QA',
    site_name: 'Obra QA',
    legacy_order_number: 'OS-QA-77',
    document_number: 'R000077001',
    document_type: 'receipt',
    due_date: '2026-08-15',
    issue_date: '2026-08-08',
    period_start: '2026-08-08',
    period_end: '2026-09-07',
    sent_at: '2026-08-10T17:30:00.000Z',
    total_amount: '300000',
    paid_amount: '100000',
    balance_amount: '200000',
    status: 'issued',
    alert: 'ok',
    ...overrides,
  };
}
