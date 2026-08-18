import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContractBillingSection } from './ContractBillingSection';
import type { ContractDetail } from '@/lib/contratos-locacoes/queries';

afterEach(cleanup);

describe('ContractBillingSection future pricing', () => {
  it('suggests the current item price for the next period while keeping the previous total visible', async () => {
    const user = userEvent.setup();
    render(
      <ContractBillingSection
        detail={detailWithUpdatedPrice()}
        paymentProofDocuments={[]}
        onAttachPaymentProof={vi.fn()}
        onCreateBillingPeriod={vi.fn()}
        onMarkBillingSent={vi.fn()}
        onOpenPaymentProof={vi.fn()}
        onRecordBillingPayment={vi.fn()}
        onUpdateBillingPeriod={vi.fn()}
      />
    );

    expect(screen.getAllByText('R$ 3.000,00').length).toBeGreaterThan(0);
    expect(screen.getByText('R$ 3.500,00')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Gerar próximo período' }));

    expect(screen.getByLabelText('Valor')).toHaveValue('R$ 3.500,00');
  });
});

function detailWithUpdatedPrice(): ContractDetail {
  return {
    contract: {
      id: 'contract-1', organization_id: 'org-1', internal_number: '8', kind: 'rental',
      contract_company: 'fontes', customer_id: 'customer-1', site_id: 'site-1', legacy_order_number: 'PED-8',
      transport_notes: null, has_remittance_invoice: false, remittance_invoice_number: null,
      remittance_invoice_issuer: null, remittance_invoice_amount: null, remittance_invoice_issue_date: null,
      start_date: '2026-07-01', end_date: null, recurrence_days: 30, pricing_model: 'fixed',
      base_amount: '350000', percentage_rate: null, status: 'active', pause_started_at: null,
      pause_reason: null, notes: null, created_at: '', updated_at: '',
    },
    customer: null,
    site: null,
    items: [{
      id: 'item-1', organization_id: 'org-1', contract_id: 'contract-1', asset_id: null,
      description: 'Transformador', equipment_type: 'Transformador', capacity: '75 kVA', serial_number: '',
      internal_code: '', quantity: 1, unit_amount: '350000', status: 'rented', returned_at: null,
      future_inventory_item_id: null, created_at: '', updated_at: '',
    }],
    billingCycles: [{
      id: 'billing-1', organization_id: 'org-1', contract_id: 'contract-1', sequence_number: 1,
      period_start: '2026-07-01', period_end: '2026-07-31', issue_date: '2026-07-01', due_date: '2026-07-31',
      base_amount: '300000', discount_amount: '0', surcharge_amount: '0', exemption_amount: '0',
      total_amount: '300000', document_type: 'receipt', document_number: 'R000008001', status: 'issued',
      sent_at: null, notes: null, created_at: '', updated_at: '',
    }],
    payments: [],
  };
}
