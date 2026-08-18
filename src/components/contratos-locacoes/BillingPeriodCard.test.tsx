import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BillingPeriodCard } from './BillingPeriodCard';
import type { BillingCycle } from '@/lib/contratos-locacoes/types';

describe('BillingPeriodCard', () => {
  it('opens the single rental invoice for a billing period', () => {
    render(
      <BillingPeriodCard
        billing={makeBilling()}
        onAttachProof={vi.fn()}
        onEdit={vi.fn()}
        onMarkSent={vi.fn()}
        onOpenProof={vi.fn()}
        onRegisterPayment={vi.fn()}
        payments={[]}
        proofDocuments={[]}
      />
    );

    expect(screen.getByRole('link', { name: /abrir fatura/i })).toHaveAttribute(
      'href',
      '/contratos-locacoes/recibos/billing-1'
    );
  });
});

function makeBilling(): BillingCycle {
  return {
    id: 'billing-1',
    organization_id: 'org-1',
    contract_id: 'contract-1',
    sequence_number: 1,
    period_start: '2026-08-01',
    period_end: '2026-08-31',
    issue_date: '2026-08-01',
    due_date: '2026-08-31',
    base_amount: '300000',
    discount_amount: '0',
    surcharge_amount: '0',
    exemption_amount: '0',
    total_amount: '300000',
    document_type: 'receipt',
    document_number: 'R000008001',
    status: 'issued',
    sent_at: null,
    notes: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  };
}
