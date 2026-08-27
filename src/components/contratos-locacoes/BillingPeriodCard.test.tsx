import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BillingPeriodCard } from './BillingPeriodCard';
import type { BillingCycle, BillingDeliveryEvent, ContractDocument } from '@/lib/contratos-locacoes/types';

afterEach(cleanup);

describe('BillingPeriodCard', () => {
  it('opens the single rental invoice for a billing period', () => {
    render(
      <BillingPeriodCard
        billing={makeBilling()}
        boletoDocument={null}
        canManageBilling={false}
        onAttachBoleto={vi.fn()}
        onAttachProof={vi.fn()}
        onEdit={vi.fn()}
        onOpenBoleto={vi.fn()}
        onOpenProof={vi.fn()}
        onRepairPendingBoleto={vi.fn()}
        onReplaceBoleto={vi.fn()}
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

  it('shows boleto controls only to an authorized billing manager', () => {
    const { rerender } = render(<BillingPeriodCard billing={makeBilling()} boletoDocument={null} canManageBilling={false} onAttachBoleto={vi.fn()} onAttachProof={vi.fn()} onEdit={vi.fn()} onOpenBoleto={vi.fn()} onOpenProof={vi.fn()} onRegisterPayment={vi.fn()} onRepairPendingBoleto={vi.fn()} onReplaceBoleto={vi.fn()} payments={[]} proofDocuments={[]} />);
    expect(screen.queryByText('Anexar boleto')).not.toBeInTheDocument();
    rerender(<BillingPeriodCard billing={makeBilling()} boletoDocument={null} canManageBilling onAttachBoleto={vi.fn()} onAttachProof={vi.fn()} onEdit={vi.fn()} onOpenBoleto={vi.fn()} onOpenProof={vi.fn()} onRegisterPayment={vi.fn()} onRepairPendingBoleto={vi.fn()} onReplaceBoleto={vi.fn()} payments={[]} proofDocuments={[]} />);
    expect(screen.getByText('Anexar boleto')).toBeInTheDocument();
    expect(screen.queryByText(/marcar como enviado/i)).not.toBeInTheDocument();
  });

  it('blocks normal replacement while pending and offers only repair', () => {
    render(<BillingPeriodCard billing={makeBilling({ boleto_change_pending: true, boleto_change_operation_id: 'op-1' })} boletoDocument={null} canManageBilling onAttachBoleto={vi.fn()} onAttachProof={vi.fn()} onEdit={vi.fn()} onOpenBoleto={vi.fn()} onOpenProof={vi.fn()} onRegisterPayment={vi.fn()} onRepairPendingBoleto={vi.fn()} onReplaceBoleto={vi.fn()} payments={[]} proofDocuments={[]} />);
    expect(screen.getByText('Concluir alteração pendente')).toBeInTheDocument();
    expect(screen.queryByText('Anexar boleto')).not.toBeInTheDocument();
  });

  it('opens or replaces the single ready boleto without exposing delete or release actions', () => {
    render(<BillingPeriodCard billing={makeBilling()} boletoDocument={makeBoleto()} canManageBilling onAttachBoleto={vi.fn()} onAttachProof={vi.fn()} onEdit={vi.fn()} onOpenBoleto={vi.fn()} onOpenProof={vi.fn()} onRegisterPayment={vi.fn()} onRepairPendingBoleto={vi.fn()} onReplaceBoleto={vi.fn()} payments={[]} proofDocuments={[]} />);
    expect(screen.getByText('Abrir boleto')).toBeInTheDocument();
    expect(screen.getByText('Substituir boleto')).toBeInTheDocument();
    expect(screen.queryByText(/excluir|liberar/i)).not.toBeInTheDocument();
  });

  it('distinguishes a current send from content changed after send', () => {
    const { rerender } = render(<BillingPeriodCard billing={makeBilling({ sent_at: '2026-08-10T12:00:00.000Z' })} boletoDocument={makeBoleto()} canManageBilling onAttachBoleto={vi.fn()} onAttachProof={vi.fn()} onEdit={vi.fn()} onOpenBoleto={vi.fn()} onOpenProof={vi.fn()} onRegisterPayment={vi.fn()} onRepairPendingBoleto={vi.fn()} onReplaceBoleto={vi.fn()} payments={[]} proofDocuments={[]} />);
    expect(screen.queryByText(/alterada após o último envio/i)).not.toBeInTheDocument();
    rerender(<BillingPeriodCard billing={makeBilling({ sent_at: '2026-08-10T12:00:00.000Z', needs_resend: true })} boletoDocument={makeBoleto()} canManageBilling onAttachBoleto={vi.fn()} onAttachProof={vi.fn()} onEdit={vi.fn()} onOpenBoleto={vi.fn()} onOpenProof={vi.fn()} onRegisterPayment={vi.fn()} onRepairPendingBoleto={vi.fn()} onReplaceBoleto={vi.fn()} payments={[]} proofDocuments={[]} />);
    expect(screen.getByText(/alterada após o último envio/i)).toBeInTheDocument();
  });

  it('shows sent time only to an authorized billing manager', () => {
    const billing = makeBilling({ sent_at: '2026-08-10T12:00:00.000Z' });
    const props = {
      billing,
      boletoDocument: null,
      onAttachBoleto: vi.fn(),
      onAttachProof: vi.fn(),
      onEdit: vi.fn(),
      onOpenBoleto: vi.fn(),
      onOpenProof: vi.fn(),
      onRegisterPayment: vi.fn(),
      onRepairPendingBoleto: vi.fn(),
      onReplaceBoleto: vi.fn(),
      payments: [],
      proofDocuments: [],
    };
    const { rerender } = render(<BillingPeriodCard {...props} canManageBilling={false} />);

    expect(screen.queryByText(/enviado em/i)).not.toBeInTheDocument();

    rerender(<BillingPeriodCard {...props} canManageBilling />);
    expect(screen.getByText(/enviado em/i)).toBeInTheDocument();
  });

  it('blocks sending without a boleto and offers send when it is ready', () => {
    const onSendBilling = vi.fn();
    const props = { billing: makeBilling(), canManageBilling: true, onAttachBoleto: vi.fn(), onAttachProof: vi.fn(), onEdit: vi.fn(), onOpenBoleto: vi.fn(), onOpenProof: vi.fn(), onRegisterPayment: vi.fn(), onRepairPendingBoleto: vi.fn(), onReplaceBoleto: vi.fn(), onSendBilling, payments: [], proofDocuments: [], deliveryEvents: [] };
    const { rerender } = render(<BillingPeriodCard {...props} boletoDocument={null} />);
    expect(screen.getByRole('button', { name: /anexe o boleto antes de enviar/i })).toBeDisabled();

    rerender(<BillingPeriodCard {...props} boletoDocument={makeBoleto()} />);
    fireEvent.click(screen.getByRole('button', { name: /^enviar cobrança$/i }));
    expect(onSendBilling).toHaveBeenCalledWith(props.billing);
  });

  it('shows the last recipients and deliberate resend for a current delivery', () => {
    const event = makeDeliveryEvent();
    render(<BillingPeriodCard billing={makeBilling({ sent_at: event.sent_at })} boletoDocument={makeBoleto()} canManageBilling deliveryEvents={[event]} onAttachBoleto={vi.fn()} onAttachProof={vi.fn()} onEdit={vi.fn()} onOpenBoleto={vi.fn()} onOpenProof={vi.fn()} onRegisterPayment={vi.fn()} onRepairPendingBoleto={vi.fn()} onReplaceBoleto={vi.fn()} onSendBilling={vi.fn()} payments={[]} proofDocuments={[]} />);
    expect(screen.getAllByText(/financeiro@cliente.com/)).toHaveLength(2);
    expect(screen.getByRole('button', { name: /reenviar cobrança/i })).toBeInTheDocument();
  });
});

function makeDeliveryEvent(): BillingDeliveryEvent {
  return {
    id: 'event-1', organization_id: 'org-1', billing_cycle_id: 'billing-1',
    sent_at: '2026-08-10T12:00:00.000Z', recipients: ['financeiro@cliente.com'],
    provider_message_id: 'provider-1', send_request_id: '11111111-1111-4111-8111-111111111111',
    additional_message: null, created_by: 'user-1', created_at: '2026-08-10T12:00:01.000Z',
  };
}

function makeBoleto(): ContractDocument {
  return {
    id: 'boleto-1', organization_id: 'org-1', contract_id: 'contract-1', billing_cycle_id: 'billing-1',
    payment_id: null, inspection_id: null, kind: 'boleto',
    storage_path: 'org-1/contract-1/boleto/billing-1.pdf', file_name: 'billing-1.pdf',
    content_type: 'application/pdf', created_by: 'user-1', created_at: '2026-08-01T00:00:00.000Z',
  };
}

function makeBilling(overrides: Partial<BillingCycle> = {}): BillingCycle {
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
    needs_resend: false,
    content_revision: '0',
    boleto_change_pending: false,
    boleto_change_operation_id: null,
    boleto_change_started_at: null,
    notes: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}
